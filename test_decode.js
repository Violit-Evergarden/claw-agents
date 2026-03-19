'use strict';

// 最新一次请求（21:47:49）- /webhook/qq/0, 200 OK
const req1 = {
  time: '21:47:49',
  uri: '/webhook/qq/0',
  appid: '1903486211',
  status: 200,
  bodyRaw: 'eyJkIjp7InBsYWluX3Rva2VuIjoiSEVZUVZ0ZXFnc3p6ZUJtVU5tNWQiLCJldmVudF90cyI6IjE3NzM1ODI0NjcifSwib3AiOjEzfQ==',
  responseRaw: 'SFRUUC8xLjEgMjAwIE9LDQpYLVBvd2VyZWQtQnk6IEV4cHJlc3MNCkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbjogKg0Kbmdyb2stc2tpcC1icm93c2VyLXdhcm5pbmc6IHRydWUNCkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOA0KQ29udGVudC1MZW5ndGg6IDE4MQ0KRVRhZzogVy8iYjUtVXYrVXlRRyt0R0JON1N6M1JZbG9weGZuaXhzIg0KRGF0ZTogU3VuLCAxNSBNYXIgMjAyNiAxMzo0Nz'
};

// 上一次请求（21:46:48）- /webhook/qq, 404
const req2 = {
  time: '21:46:48',
  uri: '/webhook/qq',
  appid: '1903486211',
  status: 404,
};

console.log('=== 请求1（最新）===');
console.log('URI:', req1.uri, '| AppId:', req1.appid, '| 响应:', req1.status);
const body1 = JSON.parse(Buffer.from(req1.bodyRaw, 'base64').toString());
console.log('请求body:', JSON.stringify(body1));

// 解码响应体
const respRaw = Buffer.from(req1.responseRaw + '==', 'base64').toString('utf8');
console.log('响应headers部分:\n', respRaw);

console.log('\n=== 请求2 ===');
console.log('URI:', req2.uri, '| AppId:', req2.appid, '| 响应:', req2.status, '← 404！路径没有/0');
