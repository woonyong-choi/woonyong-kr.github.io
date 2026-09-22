---
layout: default
title: Web Worker
nav_order: 8
permalink: /wiki/frontend-web-worker-64466876b451/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/frontend-web-worker-64466876b451
projection_sha256: 58e78ad35d77d5ab2352803d77bdbb70e1327ea81d2866ff61e61e2ea7271fd0
parent: Browser
content_status: ready
public_parent_id: Wiki/keywords/frontend-topic-7c6123c11353
grand_parent: Frontend
---

# Web Worker
{: .no_toc }

Web Worker는 Browser의 메인 JavaScript 실행 흐름과 분리된 환경에서 작업을 수행한다. 무거운 배열 정렬·픽셀 계산 같은 CPU 작업을 옮겨 메인 Thread가 입력과 DOM 작업을 처리할 여지를 만드는 데 사용한다. Worker를 만든다고 계산이 항상 더 빨라지거나 매 순간 서로 다른 CPU Core에서 실행된다는 보장은 없다.

## 계산과 화면을 나누는 경계

요리사가 오래 걸리는 반죽을 보조 요리사에게 넘기는 것처럼 계산을 분리한다. `async`나 Promise만 붙인 동기 계산은 원래 실행 흐름을 차지하지만 Worker는 별도의 실행 환경과 Event Loop를 가진다. 메인과 Worker가 겹쳐 실행될 수 있으며, 실제 병렬 실행과 처리량은 CPU·스케줄링·작업량에 달려 있다. [HTML Worker 모델](https://html.spec.whatwg.org/multipage/workers.html)

Worker 안에서는 `document`나 `window`로 페이지 DOM을 조작하지 않는다. 계산 결과를 메시지로 보내면 메인 쪽 Handler가 필요한 DOM을 갱신한다. Worker는 `self`, Timer, `fetch()` 등 Worker에 제공되는 API를 사용한다. 직접 DOM에 접근하지 못한다는 제약을 모든 API가 없다는 뜻으로 넓히지 않는다.

일반 프로그램은 `new Worker("worker.js")`와 두 파일의 `postMessage()`/`onmessage`로 요청·결과를 연결한다. 메인에서 Worker 객체에 설치한 `onmessage`는 메인의 실행 환경에서 처리하고, Worker의 `self.onmessage`는 Worker 안에서 처리한다. 데이터 복제와 메시지 처리도 비용이 들기 때문에 “postMessage만 하면 UI가 절대 멈추지 않는다”는 보장은 아니다. [Worker 메시지와 오류 처리](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)

## 복제·이전·공유를 구별하기

| 전달 방식 | 보내는 쪽 | 받는 쪽 | 고려할 점 |
|---|---|---|---|
| 일반 Structured Clone | 원래 값을 계속 사용 | 복제된 값 | 모든 함수·객체가 복제 가능한 것은 아님 |
| `ArrayBuffer` Transfer | Buffer가 Detached됨 | 넘겨받은 Buffer | 같은 Buffer를 보내는 쪽에서 다시 사용하면 안 됨 |
| `SharedArrayBuffer` | 같은 메모리에 접근 | 같은 메모리에 접근 | 동기화와 Browser의 공유 메모리 허용 조건 |

64 MiB `ArrayBuffer`를 `postMessage(buffer, [buffer])`로 보내면 보내는 쪽의 `byteLength`는 0이 된다. ArrayBuffer 데이터 복사를 피하는 이전이며 메시지 전달 전체의 비용이 0이라는 뜻은 아니다. Transfer List에만 넣고 메시지 값에서 빠뜨리면 받는 쪽에서 사용할 수 없으므로 둘을 함께 지정한다. [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

`SharedArrayBuffer`는 복제와 달리 같은 메모리를 공유하며 `Atomics` 등으로 접근 순서를 맞춰야 한다. Browser에서는 Secure Context와 Cross-origin Isolation 등 조건을 확인한다. 일반 메시지 모델은 직접 공유하는 변경 가능 상태를 줄이지만, 늦게 온 결과가 새 요청의 결과를 덮는 논리적 경쟁까지 없애지는 않는다. [공유 메모리 조건](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)

## 합계와 Buffer 소유권을 직접 확인하기

먼저 `structuredClone()`으로 복제와 이전의 차이를 확인한다. 복제한 뒤 원본을 바꾸어도 복사본은 유지되고, 이전하면 원본 Buffer가 분리된다. 아래 Run은 이 두 동작을 실제 API로 검사한다. 별도 Worker의 실행이나 메시지 전달 시간을 측정하는 예제는 아니다. [structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/structuredClone)

```run-javascript
for (const transfer of [false, true]) {
  const values = new Uint8Array([1, 2, 3, 4]);
  const buffer = values.buffer;
  const received = transfer
    ? structuredClone(buffer, { transfer: [buffer] })
    : structuredClone(buffer);
  const senderBytes = buffer.byteLength;
  if (!transfer) values[0] = 99;
  const sum = new Uint8Array(received).reduce((a, b) => a + b, 0);
  if (senderBytes !== (transfer ? 0 : 4) || sum !== 10) {
    throw new Error("복제·이전 확인 실패");
  }
  console.log(`${transfer ? "이전" : "복제"}: sender=${senderBytes}, sum=${sum}`);
}
```

예상 출력:

```text
복제: sender=4, sum=10
이전: sender=0, sum=10
```

다음은 실제 Worker와 메시지를 주고받는 예제다. **Browser의 개발자 도구 Console**에서 실행하며, Worker·Blob·URL API가 필요하다. 이 페이지의 Run에서는 추가 Worker 생성을 허용하지 않으므로 아래 코드는 Console에서 실행한다. 별도의 `worker.js` 대신 Blob URL을 사용하며, 호스트의 CSP가 Worker 또는 Blob URL을 막으면 실행할 수 없다. Node.js의 `node:worker_threads`와는 다른 API다.

```javascript
(async () => {
  const source = `self.onmessage = ({ data }) => {
    const sum = new Uint8Array(data).reduce((a, b) => a + b, 0);
    self.postMessage({ sum, documentType: typeof document });
  };`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  let worker;
  let timer;
  try {
    worker = new Worker(url);
    for (const transfer of [false, true]) {
      const values = new Uint8Array([1, 2, 3, 4]);
      const buffer = values.buffer;
      const reply = new Promise((resolve, reject) => {
        worker.onmessage = event => resolve(event.data);
        worker.onerror = event => reject(new Error(event.message));
        worker.onmessageerror = () => reject(new Error("메시지 역직렬화 실패"));
        timer = setTimeout(() => reject(new Error("Worker 응답 Timeout")), 3000);
      });
      worker.postMessage(buffer, transfer ? [buffer] : []);
      const senderBytes = buffer.byteLength;
      if (!transfer) values[0] = 99;
      const result = await reply;
      clearTimeout(timer);
      if (senderBytes !== (transfer ? 0 : 4) || result.sum !== 10 || result.documentType !== "undefined") {
        throw new Error("복제·이전·Worker 환경 확인 실패");
      }
      console.log(`${transfer ? "이전" : "복제"}: sender=${senderBytes}, sum=${result.sum}, document=${result.documentType}`);
    }
  } finally {
    clearTimeout(timer);
    worker?.terminate();
    URL.revokeObjectURL(url);
  }
})();
```

Browser Worker(Chrome 152) 실행 결과:

```text
복제: sender=4, sum=10, document=undefined
이전: sender=0, sum=10, document=undefined
```

복제 후 보내는 쪽 첫 값을 99로 바꾸어도 Worker의 합계는 10이다. 이전에서는 보내는 쪽 Buffer의 길이가 0이 된다. 마지막에는 Worker와 Blob URL을 정리한다. 이 작은 입력은 메시지 의미와 자원 정리를 확인하며 대용량 처리 속도나 실제 UI 응답성을 측정하지 않는다.

## Worker가 필요한 작업인지 판단하기

CPU 계산을 옮길지, 작은 Task로 나눌지, 기존 비동기 I/O로 충분한지 판단한다. 주로 네트워크 응답을 기다리는 작업에 Worker가 항상 필요한 것은 아니며, 계산량보다 생성·메시지·복제 비용이 크면 이득이 줄어든다. 장시간 사용하는 서비스라면 재사용할 Worker 수와 요청별 식별자·종료·실패 처리를 정한다.

Node.js의 별도 JavaScript Thread는 `node:worker_threads`의 `Worker`·`parentPort`를 사용한다. 이름이 비슷해도 Browser의 전역 `Worker`·`self`·DOM 제약과 API 사용법을 같게 취급하지 않는다. Node의 내장 비동기 I/O와 libuv Pool은 [Node.js Event Loop](/wiki/programming-languages-runtime-node-js-b30d6042ec46/)에서, 기본 실행 흐름은 [동시성과 병렬성](/wiki/programming-languages-runtime-topic-7a469485c717/)에서 읽는다.
