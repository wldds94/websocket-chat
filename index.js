import express from 'express'
import { createServer } from "node:http";
import { Server } from "socket.io"
import helmet from "helmet";
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { usersData } from './database/users.js';

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 5000
const ADMIN = "Admin"
const jwtSecret = process.env.TOKEN_SECRET || 'fhsdlkfr45bfdmfdfjk43snds45u'

const app = express()

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")))
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.post("/login", async (req, res) => {
	try {
		const { email, password } = req.body;

		// Check if the username exists
		const user = usersData?.find(user => user.email === email)
		if (!user) {
		  	return res.status(400).json({ message: 'Invalid username or password' });
		}

		// Compare the password
		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
		  	return res.status(400).json({ message: 'Invalid username or password' });
		}

		// Generate a JWT
		const token = jwt.sign({ userId: user.id }, jwtSecret);

		return res.json({ token, user: {
			id: user.id,
			name: user.name,
			email: user.email
		}});
	} catch (error) {
		console.error('Login error', error);
		res.status(500).json({ message: 'Login error' });
	}
});

const server = createServer(app);
server.listen(PORT, () => {
    console.log(`listening on port ${PORT}`)
})

// state
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"]
    }
})
io.engine.use(helmet());
io.use(async (socket, next) => {
	try {
		const token = socket.handshake.auth.token;

		const decoded = jwt.verify(token, process.env.TOKEN_SECRET);

		const user = usersData?.find(user => user.id === decoded.userId)
		if (!user) {
		  	throw new Error('User not found');
		}
		// Attach the user object to the socket
		socket.user = user;
		next();
	} catch (error) {
		console.error('Authentication error', error);
		next(new Error('Authentication error'));
	}
});
io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    // Upon connection - only to user
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App!"))

    socket.on('enterRoom', ({ name, room }) => {

        // leave previous room
        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`))
        }

        const user = activateUser(socket.id, name, room)

        // Cannot update previous room users list until after the state update in activate user
        if (prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // join room
        socket.join(user.room)

        // To user who joined
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))

        // To everyone else
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))

        // Update user list for room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        // Update rooms list for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    // When user disconnects - to all others
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)

        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User ${socket.id} disconnected`)
    })

    // Listening for a message event
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
    })

    // Listen for activity
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room
        if (room) {
            socket.broadcast.to(room).emit('activity', name)
        }
    })
})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}

// User functions
function activateUser(id, name, room) {
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}
