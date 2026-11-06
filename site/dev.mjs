// nodemon이 이 프로세스를 직접 죽인다.
//
// `npm start`는 빌드와 서버를 자식으로 띄우므로, SIGTERM이 서버까지
// 닿지 않는다. 그 사이 다음 빌드가 내보낼 자리를 비우면 옛 서버가
// 그 빈 자리를 계속 내주며 404만 남긴다.

await import("./build.mjs");
if (process.exitCode) process.exit(process.exitCode);
await import("./server.mjs");
