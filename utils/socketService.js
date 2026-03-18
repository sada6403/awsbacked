// nf-farming-backend/utils/socketService.js
let io;

const initSocket = (server) => {
    const socketIo = require('socket.io');
    io = socketIo(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            headers: ['Content-Type', 'Authorization'],
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        console.log(`\n[${new Date().toISOString()}] New client connected: ${socket.id}`);

        socket.on('disconnect', () => {
            console.log(`\n[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
        });

        // Handle joining rooms if needed (e.g. branch-specific rooms)
        socket.on('join', (room) => {
            console.log(`Socket ${socket.id} joining room: ${room}`);
            socket.join(room);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

const emitMemberEvent = (event, data, room = null) => {
    if (io) {
        if (room) {
            console.log(`Emitting event: ${event} to room: ${room}`);
            io.to(room).emit(event, data);
        } else {
            console.log(`Emitting event: ${event} (Global)`);
            io.emit(event, data);
        }
    }
};

module.exports = {
    initSocket,
    getIO,
    emitMemberEvent
};
