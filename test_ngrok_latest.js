const http = require('http');
http.get('http://127.0.0.1:4040/api/requests/http?limit=5', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const json = JSON.parse(data);
    const reqs = json.requests || [];
    reqs.forEach((r, i) => {
      const reqBody = r.request?.raw ? Buffer.from(r.request.raw, 'base64').toString('utf8') : '';
      const respBody = r.response?.raw ? Buffer.from(r.response.raw, 'base64').toString('utf8') : '';
      // 只看 op=13 的
      if (reqBody.includes('"op":13') || reqBody.includes('"op": 13')) {
        console.log(`\n=== Request #${i} ===`);
        console.log('URI:', r.request?.uri || r.uri);
        console.log('Time:', r.start);
        console.log('Request body:', reqBody.substring(0, 300));
        console.log('Response status:', r.response?.status_code);
        // 解析 HTTP 响应 raw
        const rawLines = respBody.split('\r\n');
        const blankIdx = rawLines.indexOf('');
        const bodyPart = blankIdx >= 0 ? rawLines.slice(blankIdx + 1).join('\r\n') : respBody;
        console.log('Response body:', bodyPart.substring(0, 500));
      }
    });
  });
});
