import os, json, hashlib, re, random, GeoIP
from flask import Flask, request, abort, url_for, session, redirect, render_template
from database import database
from mail import mail
from sms import sms
from inspect import getfullargspec
from functools import wraps
from nocache import nocache

app = Flask(__name__)

relpath = lambda path: os.path.join(os.path.dirname(os.path.realpath(__file__)), path)

with open(relpath("credentials/flask_secret_key")) as f:
	app.secret_key = f.read().strip()

db = database(app, relpath("database.db"), relpath("schema.sql"), ["PRAGMA foreign_keys = ON"])
gi = GeoIP.open('/usr/share/GeoIP/GeoIP.dat', GeoIP.GEOIP_STANDARD)

@app.teardown_appcontext
def close_connection(exception):
	db.close()

def parameterize(function):
	if __name__=="__main__":
		spec=getfullargspec(function)
		pivot=len(spec.args)-(len(spec.defaults) if spec.defaults else 0)
		optional, extras=set(spec.args[pivot:]), bool(spec.varkw)
		@wraps(function)
		def wrapper(*args, **kwargs):
			required=set(spec.args[len(args):pivot])
			if required-set(kwargs)-set(request.values):
				abort(400)
			for i in request.values:
				if i not in kwargs and (i not in spec.args or spec.args.index(i)>=len(args)) and \
					(i in required or i in optional or extras):
					kwargs[i]=request.values[i]
			return function(*args, **kwargs)
		return wrapper
	else:
		return function

def username_taken(username):
	return not re.match("^[a-zA-Z0-9_\-.]+$", username) or bool(db.query("SELECT id FROM auth WHERE username=?", (username,), True))

def confirmation_code(length):
	code=""
	while not code or db.query("SELECT rowid FROM confirmation_codes WHERE code=?", (code,), True):
		code="".join(random.choice("abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789") for i in range(length))
	db.execute("INSERT INTO confirmation_codes (code) VALUES (?)", (code,))
	return code

def confirmed_code(code):
	if db.query("SELECT rowid FROM confirmation_codes WHERE code=?", (code,), True):
		db.execute("DELETE FROM confirmation_codes WHERE code=?", (code,), True)
		return True
	else:
		return False

def hashed(salt, password):
	return hashlib.pbkdf2_hmac('sha512', password.encode(), salt, 100000)

@app.route("/signup/custom/available", methods=["POST"])
@parameterize
def check_username(username):
	return json.dumps(not username_taken(username))

@app.route("/signup/custom", methods=["GET", "POST"])
@parameterize
def signup(username, password, name=None, email=None, phone=None):
	if phone and not re.match("^[0-9]{6,}$", phone) or email and not re.match("^\S+@\S+\.\S+$", email) or username_taken(username) or len(password)<8:
		abort(400)
	userid=db.execute("INSERT INTO users (name) VALUES (?)", (name,))
	salt=os.urandom(32)
	authid=db.execute("INSERT INTO auth (username, salt, hash, user) VALUES (?, ?, ?, ?)", (username, salt, hashed(salt, password), userid))
	db.execute("UPDATE users SET auth=? WHERE id=?", (authid, userid))
	if email:
		code=confirmation_code(24)
		url=url_for("confirm_email", code=code, _external=True)
		mail(email, "Semaphore Email Confirmation", "Welcome to Semaphore! If your username is "+username+
			", <a href=\""+url+"\">click here to confirm your email address</a>. Please note that this will disassociate your account from all other accounts",
			"Welcome to Semaphore! If your username is "+username+
			", paste this address into your browser to confirm your email address:\n\n"+url+
			"\n\nPlease note that this will disassociate your account from all other accounts")
		db.execute("INSERT INTO email_confirmation (email, user, code) VALUES (?, ?, ?)", (email, userid, code))
	signin(username, password)
	if phone:
		code=confirmation_code(8)
		sms(phone, "Your confirmation code for Semaphore is "+code)
		db.execute("INSERT INTO phone_confirmation (phone, user, code) VALUES (?, ?, ?)", (phone, userid, code))
		return json.dumps(True)
	else:
		return json.dumps(False)

@app.route("/signup/confirm/email")
@parameterize
def confirm_email(code):
	if confirmed_code(code):
		email, user=db.query("SELECT email, user FROM email_confirmation WHERE code=?", (code,), True)
		db.execute("DELETE FROM email_confirmation WHERE code=?", (code,))
		db.execute("DELETE FROM emails WHERE email=?", (email,))
		db.execute("INSERT INTO emails (email, user) VALUES (?, ?)", (email, user))
		return "Your email address has been confirmed, you can now close this tab" # TODO
	else:
		return "An error has occured, please try resending the confirmation code" # TODO

@app.route("/signup/confirm/phone", methods=["GET", "POST"])
@parameterize
def confirm_phone(code = None):
	if request.method=="POST":
		if not code:
			abort(400)
		elif confirmed_code(code):
			phone, user=db.query("SELECT phone, user FROM phone_confirmation WHERE code=?", (code,), True)
			db.execute("DELETE FROM phone_confirmation WHERE code=?", (code,))
			db.execute("DELETE FROM phones WHERE phone=?", (phone,))
			db.execute("INSERT INTO phones (phone, user) VALUES (?, ?)", (phone, user))
			return json.dumps(True)
		else:
			return json.dumps(False)
	else:
		return app.send_static_file("confirm_phone.html")

@app.route("/signin/custom", methods=["POST"])
@parameterize
def signin(username, password):
	authid, salt, check, userid=db.query("SELECT id, salt, hash, user FROM auth WHERE username=?", (username,), True) or [None, None, None, None]
	if salt and hashed(salt, password)==check:
		session["user"]=userid
		code=os.urandom(64)
		session["code"]=code
		name, address=db.query("SELECT name, address FROM users WHERE id=?", (userid,), True)
		session["userinfo"]={
			"id": userid,
			"username": username,
			"name": name,
			"address": address
		}
		loginid=db.execute("INSERT INTO logins (code, ip, auth) VALUES (?, ?, ?)", (code, request.environ['REMOTE_ADDR'], authid))
		db.execute("INSERT INTO login_codes (code, user, login) VALUES (?, ?, ?)", (code, userid, loginid))
		return json.dumps(True)
	else:
		return json.dumps(False)

def valid_session():
	if "user" in session and "code" in session:
		return (db.query("SELECT login FROM login_codes WHERE user=? AND code=?", (session["user"], session["code"]), True) or [False])[0]
	else:
		return None

def require_login(param):
	def decorator(function):
		@wraps(function)
		def wrapper(*args, **kwargs):
			loginid=valid_session()
			if loginid:
				db.execute("INSERT INTO activity (login, url) VALUES (?, ?)", (loginid, request.path))
				if param:
					kwargs[param]={**session["userinfo"],
						"emails": sum(db.query("SELECT email FROM emails WHERE user=?", (session["user"],)), ()),
						"phones": sum(db.query("SELECT phone FROM phones WHERE user=?", (session["user"],)), ())
					}
				return function(*args, **kwargs)
			elif request.method=="GET":
				return redirect(url_for("login", next=request.path))
			else:
				abort(401)
		return wrapper
	if callable(param):
		function, param=param, None
		return decorator(function)
	else:
		return decorator

@app.route("/")
def index():
	if valid_session():
		return redirect(url_for("home"))
	else:
		return redirect(url_for("welcome"))

@app.route("/index")
def welcome():
	return app.send_static_file("index.html")

@app.route("/invest")
def invest():
	if gi.country_code_by_addr(request.environ['REMOTE_ADDR']) == 'US':
		return app.send_static_file("block_us.html")
	return app.send_static_file("invest.html")

@app.route("/login")
def login():
	return app.send_static_file("index.html")

@app.route("/logout")
def logout():
	session.clear()
	return redirect(url_for("index"))

@app.route("/home")
@nocache
@require_login("user")
def home(user):
	return render_template("home.html", name=user["name"] or user["username"], username=user["name"] and user["username"], emails=user["emails"], phones=user["phones"])

if __name__ == "__main__":
	app.run(port = 8000, debug = True, host="0.0.0.0")
