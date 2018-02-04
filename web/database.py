# http://flask.pocoo.org/docs/0.11/patterns/sqlite3/

import sqlite3, os.path
from flask import g
from inspect import getargspec

def wrap(optional = False):
	def decorator(function):
		argspec = getargspec(function)
		argnames = argspec[0]
		def wrapper(*args, **kwargs):
			try:
				return function(*args, **kwargs)
			except RuntimeError as e:
				with (kwargs[argnames[0]] if argnames[0] in kwargs else args[0]).app.app_context():
					return function(*args, **kwargs)
		if optional:
			argpos = argnames.index(optional)
			required, default = (lambda defaults, pos: (False, defaults[pos]) if -pos<=len(defaults) else (True, True))\
				(argspec[-1], argpos-len(argnames))
			def towrap(*args, **kwargs):
				if kwargs[optional] if optional in kwargs else \
					(args[argpos] if required or argpos<len(args) else default):
					return wrapper(*args, **kwargs)
				else:
					return function(*args, **kwargs)
			return towrap
		else:
			return wrapper
	return decorator

class database:
	# creates database if it doesn't exist; set up by schema
	def __init__(self, app, database, schema, init=[]):
		self.database=database
		self.init=init
		if not os.path.exists(database):
			with app.app_context():
				db = self.get()
				with app.open_resource(schema, mode='r') as f:
					db.cursor().executescript(f.read())
				db.commit()
		self.app=app
		self.get()

	# returns a database connection
	@wrap("wrap")
	def get(self, wrap = True):
		db = getattr(g, '_database', None)
		if db is None:
			db = g._database = sqlite3.connect(self.database)
			for i in self.init:
				self.execute(i)
		return db

	@wrap("wrap")
	def query(self, query, args = (), one = False, wrap = True):
		cur = self.get(False).execute(query, args)
		rv = cur.fetchall()
		cur.close()
		return (rv[0] if rv else None) if one else rv

	@wrap("wrap")
	def execute(self, query, args = (), wrap = True):
		con = self.get(False)
		cur = con.cursor()
		cur.execute(query, args)
		con.commit()
		res = cur.lastrowid
		cur.close()
		return res

	def close(self):
		db = getattr(g, '_database', None)
		if db is not None:
			db.close()
