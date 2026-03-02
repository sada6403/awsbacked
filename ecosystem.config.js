module.exports = {
    apps: [{
        name: "awsbacked",
        script: "server.js",
        instances: "max", // Uses all available CPU cores
        exec_mode: "cluster", // Enables Node.js cluster mode for load balancing
        watch: false,
        max_memory_restart: '1G', // Prevent memory leaks by restarting if it hits 1GB per core
        env: {
            NODE_ENV: "production",
            TZ: "Asia/Colombo"
        }
    }]
};
