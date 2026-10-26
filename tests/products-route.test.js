const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");

const { createApp } = require("../src/app");

test("POST /api/v1/products is registered and requires authentication", async () => {
  const server = createApp().listen(0);
  await once(server, "listening");

  try {
    const { port } = server.address();
    const response = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/v1/products",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => resolve({ statusCode: res.statusCode, body }));
        },
      );

      request.on("error", reject);
      request.end(JSON.stringify({ name: "Test product", price: 100 }));
    });

    assert.equal(response.statusCode, 401);
    assert.match(response.body, /No token provided/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
