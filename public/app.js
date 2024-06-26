const emailInput = document.querySelector('#email')
const passwordInput = document.querySelector('#password')
document.querySelector('.form-login')
    .addEventListener('submit', login)

async function login(e) {
    e.preventDefault()
	if (emailInput.value && passwordInput.value) {
		const payload = {
            email: emailInput.value,
            password: passwordInput.value
        }
		const response = await fetch('/login', {
			method: 'POST',
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload)
		}).then(res => res.json())

		if (response.token && response.user) {
			initSocket(response.token, response.user)
		}
    }
}

function initSocket(token, user) {
	document.body.classList.add('logged')
	const socket = io('ws://localhost:7788', {
		auth: {
			token: token
		}
	})

	const msgInput = document.querySelector('#message')
	const chatRoom = document.querySelector('#room')
	const activity = document.querySelector('.activity')
	const usersList = document.querySelector('.user-list')
	const roomList = document.querySelector('.room-list')
	const chatDisplay = document.querySelector('.chat-display')

	function sendMessage(e) {
		e.preventDefault()
		if (msgInput.value && chatRoom.value) {
			socket.emit('message', {
				name: user.name,
				text: msgInput.value
			})
			msgInput.value = ""
		}
		msgInput.focus()
	}

	function enterRoom(e) {
		e.preventDefault()
		if (chatRoom.value) {
			socket.emit('enterRoom', {
				name: user.name,
				room: chatRoom.value
			})
		}
	}

	document.querySelector('.form-msg')
		.addEventListener('submit', sendMessage)

	document.querySelector('.form-join')
		.addEventListener('submit', enterRoom)

	msgInput.addEventListener('keypress', () => {
		socket.emit('activity', user.name)
	})

	// Listen for messages
	socket.on("message", (data) => {
		activity.textContent = ""
		const { name, text, time } = data
		const li = document.createElement('li')
		li.className = 'post'
		if (name === user.name) li.className = 'post post--left'
		if (name !== user.name && name !== 'Admin') li.className = 'post post--right'
		if (name !== 'Admin') {
			li.innerHTML = `<div class="post__header ${name === user.name
				? 'post__header--user'
				: 'post__header--reply'
				}">
			<span class="post__header--name">${name}</span>
			<span class="post__header--time">${time}</span>
			</div>
			<div class="post__text">${text}</div>`
		} else {
			li.innerHTML = `<div class="post__text">${text}</div>`
		}
		document.querySelector('.chat-display').appendChild(li)

		chatDisplay.scrollTop = chatDisplay.scrollHeight
	})

	let activityTimer
	socket.on("activity", (name) => {
		activity.textContent = `${name} is typing...`

		// Clear after 3 seconds
		clearTimeout(activityTimer)
		activityTimer = setTimeout(() => {
			activity.textContent = ""
		}, 3000)
	})

	socket.on('userList', ({ users }) => {
		showUsers(users)
	})

	socket.on('roomList', ({ rooms }) => {
		showRooms(rooms)
	})

	function showUsers(users) {
		usersList.textContent = ''
		if (users) {
			usersList.innerHTML = `<em>Users in ${chatRoom.value}:</em>`
			users.forEach((user, i) => {
				usersList.textContent += ` ${user.name}`
				if (users.length > 1 && i !== users.length - 1) {
					usersList.textContent += ","
				}
			})
		}
	}

	function showRooms(rooms) {
		roomList.textContent = ''
		if (rooms) {
			roomList.innerHTML = '<em>Active Rooms:</em>'
			rooms.forEach((room, i) => {
				roomList.textContent += ` ${room}`
				if (rooms.length > 1 && i !== rooms.length - 1) {
					roomList.textContent += ","
				}
			})
		}
	}
}
