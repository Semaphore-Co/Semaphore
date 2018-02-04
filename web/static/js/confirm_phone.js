function next(){
	let search = location.search.substring(1),
		query = search?JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g,'":"') + '"}',
			function(key, value) { return key===""?value:decodeURIComponent(value) }):{}
	if(query["next"]) window.location = query["next"]
	else window.location = "/home"
}
function submit(){
	code = ""
	for(let j of document.getElementsByClassName("code")){
		if(j.value == "") return
		code += j.value
	}
	incorrect.style.display = ""
	disconnected.style.display = ""
	fetch("/signup/confirm/phone?code="+code, {method: 'POST', credentials: 'same-origin'})
		.then(res => res.json())
		.then(res => {
			if(res){
				next()
			}else{
				incorrect.style.display = "block"
			}
		}).catch(error => {
			disconnected.style.display = "block"
		})
}
let valid = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
let final = document.getElementById("submit")
let disconnected = document.getElementById("internet-disconnected")
let incorrect = document.getElementById("incorrect")
Array.prototype.forEach.call(document.getElementsByClassName("code"), i => {
	i.onfocus = () => {
		i.select()
	}
	i.onkeydown = (e) => {
		if((e.which || e.keyCode) == 8 && i.value == ""){
			let prev = i.previousElementSibling
			if(prev && prev.classList.contains("code")){
				prev.value = ""
				prev.focus()
			}
		}else if((e.which || e.keyCode) == 13){
			submit()
			e.preventDefault()
		}
	}
	i.onkeypress = (e) => {
		if(valid.indexOf(String.fromCharCode(e.which || e.keyCode)) == -1){
			i.value = ""
			e.preventDefault()
		}
	}
	i.oninput = () => {
		let j = i
		for(let value of i.value){
			if(valid.indexOf(value) == -1) continue
			j.value = value
			j = j.nextElementSibling
			if(!j || !j.classList.contains("code")) return final.focus()
		}
		j.focus()
	}
})
final.onclick = () => {
	submit()
}
document.getElementById("cancel").onclick = next