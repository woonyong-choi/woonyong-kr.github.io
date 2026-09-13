---
layout: default
title: Node.js Event Loop
nav_order: 3
permalink: /wiki/programming-languages-runtime-node-js-b30d6042ec46/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-node-js-b30d6042ec46
projection_sha256: 196d4f7643d18b7cd21724a7b843f3c82d3099518c423dbef5668670eb298fb4
parent: Node.js
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/nodejs
search_terms:
- Node.js 이벤트 루프
grand_parent: Runtime
ancestor: Programming
---

# Node.js Event Loop
{: .no_toc }

Node.js는 기본 JavaScript Event Loop의 Callback 실행과 OS·libuv가 진행하는 작업을 구분한다. 기본 Loop가 하나라는 말이 Node 프로세스의 모든 Thread가 하나이거나 모든 I/O가 같은 백그라운드 경로를 사용한다는 뜻은 아니다.

## Socket 준비 감시와 파일 작업은 다르다

Unix 계열의 Network I/O는 Non-blocking Socket과 Linux의 `epoll`, BSD/macOS의 `kqueue` 같은 준비 감시를 사용한다. Windows에서는 IOCP 등 플랫폼에 맞는 경로를 사용한다. `libuv`의 Event Loop가 준비된 Callback을 실행하며, 처리할 일이 없을 때는 I/O를 기다릴 수 있다. [libuv 설계](https://docs.libuv.org/en/v1.x/design.html)

일반적인 비동기 파일 API는 libuv Thread Pool에 작업을 맡긴다. 기본 Pool 크기는 4이며 `UV_THREADPOOL_SIZE`로 시작 시 조정할 수 있고 여러 Loop에서 공유한다. 이 Worker Pool은 JavaScript를 별도로 실행하는 `node:worker_threads`와 다른 대상이다. [libuv Thread Pool](https://docs.libuv.org/en/v1.x/threadpool.html)

“파일 읽기도 epoll이 끝까지 수행한다”는 설명은 맞지 않는다. libuv 문서에는 Linux의 일부 파일 작업을 io_uring에 맡긴 v1.45.0 이후 경로와, v1.49.0부터 기본 Thread Pool로 돌아간 변경도 있다. Runtime 버전과 Loop 설정을 확인한 뒤 구체적인 백그라운드 구현을 말해야 한다. [libuv 파일 작업과 버전 차이](https://docs.libuv.org/en/v1.x/fs.html)

## 동기 호출과 비동기 API의 반환을 비교하기

다음은 **Node.js 파일 API의 설명용 발췌**다. Browser나 Web Worker에는 `node:fs`와 로컬 `big.log` 접근이 없으며 이 코드를 Browser Run으로 실행하지 않는다.

```javascript
import { readFile, readFileSync } from "node:fs";

const data = readFileSync("big.log");
console.log(data.length); // 동기 읽기가 반환된 뒤 실행한다.

readFile("big.log", (error, data) => {
  if (error) {
    console.error(error);
    return;
  }
  console.log(data.length);
});
console.log("비동기 읽기를 요청한 뒤 실행한다.");
```

Node의 Callback 형식은 `(error, data)`다. Callback을 `(data)`처럼 한 인자만 받도록 작성하면 성공 시 첫 인자인 null을 데이터로 착각한다. 비동기 요청 후 다른 JavaScript를 실행할 수 있고, 나중에 결과 Callback을 같은 Loop에서 처리한다. 파일 작업의 실제 완료 순서까지 코드의 호출 순서와 같다는 보장은 없다. [Node 파일 API](https://nodejs.org/api/fs.html#fsreadfilepath-options-callback)

Promise API인 `node:fs/promises`의 `readFile()`도 실패할 수 있다. 두 `handle()` 호출은 읽기를 겹쳐 진행할 수 있지만 Pool·디스크·메모리 상황에 따라 완료 시점이 달라진다. `await`는 해당 함수를 이어 실행하는 문법이며 파일 작업을 구현하는 OS API의 이름은 아니다. Promise 실패 수거와 독립 작업의 시작 순서는 [async와 await](/wiki/programming-languages-runtime-async-await-16ab8decaafb/)의 실행 예제에서 확인한다.

## Loop와 Worker Pool 모두 긴 작업의 영향을 받는다

Node의 Loop에는 Timer·Poll·Check·Close 등의 Phase가 있고 `process.nextTick()`과 Promise Job 처리도 관여한다. Timer는 지정 시간이 지나면 실행 가능한 후보가 되며 정확한 실행 시각을 보장하지 않는다. Node.js 20에 포함된 libuv 1.45.0부터의 Timer/Poll 순서 변경처럼 버전에 따른 차이도 있다. Browser의 Task/Microtask 그림 하나로 모든 Node Callback 순서를 고정하지 않는다. [Node Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)

`readFileSync()`나 긴 JavaScript 계산은 해당 Loop를 붙잡는다. Pool Worker가 큰 파일 작업을 오래 처리하면 Pool의 다른 작업도 기다릴 수 있다. `async` 함수로 감싼 것만으로 두 병목이 사라지지는 않는다. 독립적인 CPU 계산에는 `node:worker_threads`를 검토하고, 연결·대기 Queue·작업 크기를 제한한다. 비동기 I/O를 위해 요청마다 JavaScript Worker를 만드는 것이 기본 선택은 아니다. [Node의 Loop와 Worker Pool](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop), [Worker Threads](https://nodejs.org/api/worker_threads.html)
