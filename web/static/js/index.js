function EllipticCurve(a, b){
	// y^2 = x^3 + a x + b
	let radical = -9 * b + Math.sqrt(12 * Math.pow(a, 3) + 81 * b * b)
	radical = Math.sign(radical) * Math.pow(Math.abs(radical), 1 / 3)
	this.zero = (-2 * Math.pow(3, 1 / 3) * a + Math.pow(2, 1 / 3) * radical * radical) / (Math.pow(6, 2 / 3) * radical)
	this.y = x => {
		return Math.sqrt(Math.pow(x, 3) + a * x + b)
	}
	this.d = x => { return x <= this.zero ? Infinity : (a + 3 * x * x)/(2 * Math.sqrt(b + a * x + Math.pow(x, 3))) }
	this.l = (d, start) => {
		start=start||this.zero
		let step = .0001, x = start + step, l = 0,
			f = x => { return Math.sqrt(1 + Math.pow(a + 3 * x * x, 2)/(4 * (b + a * x + Math.pow(x, 3)))) }
		d *= 2 / step
		for(let p = f(Math.max(start, this.zero + step)); l < d; x += step){
			l += p
			l += p = f(x)
		}
		return x
	}
	let QuadraticBezier = (step, x, y) => {
		let x0 = this.zero, y0 = 0, m0=Infinity, res = [[x0, y0]]
		while((!x||x0<x)&&(!y||y0<y)){
			let x1=this.l(step, x0), y1=this.y(x1), m1=this.d(x1),
				xc = isFinite(m0) ? (m0 * x0 - m1 * x1 + y1 - y0) / (m0 - m1) : x0, yc = m1 * (xc - x1) + y1
			res.push([xc,yc,x1,y1])
			x0 = x1
			y0 = y1
			m0 = m1
		}
		return res
	}
	let createPath = (ele, d, stroke, width) => {
		let pathEle = document.createElementNS("http://www.w3.org/2000/svg", "path")
		pathEle.setAttribute("d", d)
		pathEle.setAttribute("stroke", stroke)
		pathEle.setAttribute("fill", "transparent")
		pathEle.setAttribute("stroke-width", width)
		ele.appendChild(pathEle)
		return pathEle
	}
	this.path = (ele, x, y) => {
		let path = QuadraticBezier(.2, x, y * .45), top = bottom = "M " + path[0].join(" ")
		for(var i = 1; i < path.length; i++){
			bottom += " Q " + path[i].join(" ")
			path[i][1] *= -1
			path[i][3] *= -1
			top += " Q " + path[i].join(" ")
		}
		createPath(ele, bottom, "url(#right)", ".03")
		createPath(ele, top, "url(#right)", ".03")
		ele.setAttribute("viewBox", [this.zero - .1 * x / 1.2, -y / 2, x, y].join(" "))
	}
	let next = (x0, y0, x1, y1) => {
		let m = (y1 - y0) / (x1 - x0), x = m * m - x1 - x0
		return {x: x, y: m * (x1 - x) - y1}
	}
	this.illustrate = (ele, sgn, x0, x1, n) => {
		let y0 = sgn * this.y(x0), p = {x: x1, y: this.y(x1)}, res = []
		for(let i = 0; i < n; i++){
			//console.log(p.x,p.y)
			res.push(createPath(ele, "M " + x0 + " " + y0 + " L " + p.x + " " + p.y, "rgba(0,0,0,.3)", ".01"))
			p = next(x0, y0, p.x, p.y)
		}
		return res
	}
}
let show, dismiss
((main, svg) => {
	let curve = new EllipticCurve(-1, 1.4)
	curve.path(svg, 6, 6)
	let c = 0, m = 2, s = .03, l = [], transitioning = false
	curve.illustrate(svg, -1, curve.l(m), Math.random(), 30)
	window.addEventListener("scroll", () => {
		if(!transitioning){
			while(window.scrollY > (c + s) * window.innerHeight && c < 1){
				c += s
				l.push(curve.illustrate(svg, c < 0.5 ? -1 : 1, curve.l(Math.abs((1 - c * 2) * m)), Math.random(), 30))
			}
			while(window.scrollY < c * window.innerHeight && c > 0 && l.length){
				c -= s
				for(let e = l.pop(), i = e.length - 1; i >= 0; i--){
					e[i].remove()
				}
			}
		}
	}, {"passive": true})
	let first = main.firstElementChild
	show = () => {
		login()
		history.pushState({ login: true }, "", "login");
	}
	let login = () => {
		transitioning = true
		first.style.marginTop = -window.scrollY
		main.classList.add("locked", "behind")
	}
	let cleanup = () => {
		let scroll = -parseInt(first.style.marginTop)
		main.classList.remove("locked")
		transitioning = false
		first.style.marginTop = 0
		window.scrollTo(0, scroll)
		main.removeEventListener("transitionend", cleanup)
	}
	let hide = () => {
		main.classList.remove("behind")
		main.addEventListener("transitionend", cleanup)
	}
	dismiss = () => {
		history.pushState({ login: false }, "", "index");
		hide()
	}
	window.onpopstate = (e) => {
		if(e.state&&e.state.login){
			login()
		}else{
			hide()
		}
	}
	if(window.location.pathname=="/login"){
		document.body.classList.add("no-transition")
		main.classList.add("locked", "behind")
		document.body.classList.remove("no-transition")
		history.replaceState({ login: true }, "")
	}
})(document.getElementById("main"), document.getElementById("elliptic-curve"))
Array.prototype.forEach.call(document.querySelectorAll("#faq > li"), i => {
	i.onclick = () => {
		if(!i.classList.contains("opened")){
			let prev = document.querySelector(".opened")
			if(prev){
				prev.classList.remove("opened")
			}
		}
		i.classList.toggle("opened")
	}
});
((ele, valid) => {
	let timeout, prev = "", checking = true, request, parent = ele.parentElement, availability = () => {
		if(parent.classList.contains("is-invalid")) return
		checking = true
		request = new XMLHttpRequest()
		request.onload = () => {
			if(JSON.parse(request.responseText)){
				valid.style.visibility = "visible"
			}else{
				parent.classList.add("is-invalid","is-taken")
			}
		}
		request.open("POST", "/signup/custom/available?username="+encodeURIComponent(ele.value))
		request.send()
	}
	ele.addEventListener("input", () => {
		if(ele.value != prev){
			checking = false
			window.clearTimeout(timeout)
			if(request) request.abort()
			valid.style.visibility = ""
			parent.classList.remove("is-invalid","is-taken")
			if(ele.value){
				timeout = window.setTimeout(availability, 500)
			}
		}
		prev = ele.value
	})
	ele.addEventListener("blur", () => {
		if(!checking && ele.value){
			window.clearTimeout(timeout)
			availability()
		}
	})
})(document.getElementById("signup-username"), document.getElementById("username-valid"));
((signin, signup, username, incorrect) => {
	function next(){
		let search = location.search.substring(1),
			query = search?JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g,'":"') + '"}',
				function(key, value) { return key===""?value:decodeURIComponent(value) }):{}
		if(query["next"]) window.location = query["next"]
		else window.location = "/home"
	}
	let submit = (url, ele, disconnected, fields, required, preprocessing, success, error) => {
		let cleanup = () => {
			for(let i of fields){
				document.getElementById(i).disabled = false
			}
			ele.disabled=false
		}
		return (e) => {
			let data = {}, fail = false
			for(let i of fields){
				let e = document.getElementById(i)
				if(e.parentElement.classList.contains('is-invalid')){
					fail = true
				}else if(e.value.length){
					data[i.split('-')[1]] = e.value
				}else if(required.includes(i)){
					fail = true
					e.parentElement.classList.add("is-invalid")
				}
			}
			if(fail) return
			for(let i of fields){
				document.getElementById(i).disabled = true
			}
			ele.disabled = true
			preprocessing(data)
			let params = Object.entries(data).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
			disconnected.style.display = ""
			fetch(url+params, {method: 'POST', credentials: 'same-origin'}).then(response => {
				if(response.ok){
					return response.json()
				}else{
					cleanup()
					if(error) error()
				}
			}).then(success(cleanup)).catch(error => {
				cleanup()
				disconnected.style.display = "block";
			})
		}
	}
	signup.onclick = submit("/signup/custom?", signup, document.getElementById("signup-internet-disconnected"),
			["signup-username", "signup-password", "signup-name", "signup-phone", "signup-email"],
			["signup-username", "signup-password"], data => {
				if(data['phone']) data['phone'] = data['phone'].replace(/[^0-9]/g, '')
			}, () => response => {
				if(response === true){
					window.location="/signup/confirm/phone"+window.location.search
				}else if(response === false){
					next()
				}
			}, () => {
				username.parentElement.classList.add("is-invalid","is-taken")
			})
	signin.onclick = submit("/signin/custom?", signin, document.getElementById("signin-internet-disconnected"),
			["signin-username", "signin-password"],["signin-username", "signin-password"], () => {
				incorrect.style.display=""
			}, cleanup => response => {
				if(response===true){
					next()
				}else if(response === false){
					incorrect.style.display="block"
					cleanup()
				}
			})
})(document.getElementById("signin"), document.getElementById("signup"), document.getElementById("signup-username"), document.getElementById("signin-incorrect"))