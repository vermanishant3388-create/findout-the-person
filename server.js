const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {

    // Health check
    if (req.url === "/" || req.url === "/health") {

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            status: "online",
            project: "FINDOUT THE PERSON",
            websocket: "ready",
            time: new Date().toISOString()
        }));

        return;
    }

    res.writeHead(404);
    res.end("Not Found");
});

const wss = new WebSocket.Server({
    server
});

let cameraClient = null;
const dashboardClients = new Set();

let lastDetection = {
    count: 0,
    persons: [],
    timestamp: Date.now()
};

function send(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}

function broadcastDashboards(data) {

    const message = JSON.stringify(data);

    for (const client of dashboardClients) {

        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }

    }
}

wss.on("connection", (ws) => {

    console.log("WebSocket client connected");

    ws.role = null;

    send(ws, {
        type: "server_status",
        status: "online"
    });

    ws.on("message", (rawMessage) => {

        try {

            const data =
                JSON.parse(rawMessage.toString());

            // -----------------------------
            // CAMERA REGISTER
            // -----------------------------

            if (data.type === "camera_register") {

                // Only one active camera
                if (
                    cameraClient &&
                    cameraClient !== ws &&
                    cameraClient.readyState === WebSocket.OPEN
                ) {

                    send(ws, {
                        type: "camera_register",
                        status: "rejected",
                        reason: "Another camera is already connected"
                    });

                    return;
                }

                cameraClient = ws;
                ws.role = "camera";

                console.log("CAMERA ONLINE");

                broadcastDashboards({
                    type: "camera_status",
                    status: "online"
                });

                return;
            }

            // -----------------------------
            // DASHBOARD REGISTER
            // -----------------------------

            if (data.type === "dashboard_register") {

                dashboardClients.add(ws);
                ws.role = "dashboard";

                console.log("DASHBOARD ONLINE");

                send(ws, {
                    type: "initial_data",

                    camera:
                        cameraClient &&
                        cameraClient.readyState === WebSocket.OPEN
                            ? "online"
                            : "offline",

                    detection: lastDetection
                });

                return;
            }

            // -----------------------------
            // DETECTION DATA
            // -----------------------------

            if (
                data.type === "detections" &&
                ws === cameraClient
            ) {

                const count =
                    Number.isFinite(Number(data.count))
                        ? Number(data.count)
                        : 0;

                const persons =
                    Array.isArray(data.persons)
                        ? data.persons.slice(0, 30)
                        : [];

                lastDetection = {

                    count,

                    persons,

                    timestamp: Date.now()

                };

                broadcastDashboards({

                    type: "detections",

                    count,

                    persons,

                    timestamp:
                        lastDetection.timestamp

                });

                return;
            }

        } catch (error) {

            console.log(
                "Invalid WebSocket message"
            );

        }

    });

    ws.on("close", () => {

        // Camera disconnected
        if (ws === cameraClient) {

            cameraClient = null;

            console.log("CAMERA OFFLINE");

            broadcastDashboards({
                type: "camera_status",
                status: "offline"
            });

        }

        // Dashboard disconnected
        if (ws.role === "dashboard") {

            dashboardClients.delete(ws);

            console.log("DASHBOARD OFFLINE");

        }

    });

    ws.on("error", (error) => {

        console.log(
            "WebSocket error:",
            error.message
        );

    });

});

// Keep connection alive
setInterval(() => {

    wss.clients.forEach((ws) => {

        if (ws.readyState === WebSocket.OPEN) {

            ws.ping();

        }

    });

}, 25000);

server.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("================================");
    console.log(" FINDOUT THE PERSON");
    console.log(" WEBSOCKET SERVER ONLINE");
    console.log("================================");
    console.log("PORT:", PORT);
    console.log("================================");
    console.log("");

});
