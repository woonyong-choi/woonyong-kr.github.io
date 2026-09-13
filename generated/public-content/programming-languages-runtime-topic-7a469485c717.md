---
layout: default
title: 동시성과 병렬성
nav_order: 2
permalink: /wiki/programming-languages-runtime-topic-7a469485c717/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-topic-7a469485c717
projection_sha256: 9d34922ee5f306afe50c5c358cb9d4f6b69fb05ffd777599647a0941df84990b
parent: 동시성
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/concurrency
grand_parent: Programming
---

# 동시성과 병렬성
{: .no_toc }

동시성은 여러 작업이 겹치는 기간에 진행될 수 있는 구조이고, 병렬성은 여러 실행 주체가 같은 순간에 실제 작업을 수행하는 것이다. 동시성이 반드시 Thread 하나를 뜻하지는 않는다. 하나의 JavaScript 실행 Agent에서는 현재 실행 흐름을 마친 뒤 다른 Job을 실행하지만, Worker를 추가하면 별도 Agent에서도 JavaScript를 실행할 수 있다.

## 한 실행 흐름이 여러 요청을 진행하는 방법

요리사 한 명이 스테이크를 굽는 동안 파스타와 수프를 준비하듯, I/O 대기를 OS나 Runtime에 맡긴 뒤 실행 가능한 다른 작업을 처리할 수 있다. Call Stack에는 중첩 호출의 Frame이 쌓이며, 현재 실행 흐름이 끝나거나 허용된 지점에서 이어질 작업을 넘겨야 다음 Job이 실행된다. Event Loop를 Stack이 빌 때까지 CPU로 계속 Busy Polling하는 코드로 이해하지 않는다.

Thread당 Stack을 1 MiB로 가정하면 10,000개에는 약 9.77 GiB의 가상 주소 범위가 필요하다. 이는 가정에 따른 산술이며 모든 OS의 기본 Stack 크기나 실제 물리 메모리 사용량이 아니다. Stack의 예약·실제 사용·Commit과 실행 가능한 Thread 수를 구별해야 한다. 접속 수가 늘었다는 사실만으로 Context Switch 시간이 같은 비율로 늘어나는 것도 아니다.

요청당 CPU 작업이 0.1 ms이고 50 ms의 I/O 대기 구간이 있다고 가정하면, 그 구간에는 산술상 500회분의 CPU 작업 예산이 있다. 응답 처리·Queue·GC·Runtime 비용과 실제 I/O 완료 시점을 제외한 계산이므로 “동시 접속 500개를 같은 지연으로 처리했다”는 측정값이 아니다. 실제 배치 방식은 [입출력 다중화](/wiki/computer-systems-network-topic-5022e4b7c883/)와 [Node.js Event Loop](/wiki/programming-languages-runtime-node-js-b30d6042ec46/)에서 이어진다.

## Browser의 Task와 Microtask

Browser Event Loop는 하나 이상의 Task Queue와 별도의 Microtask Queue를 가진다. 하나의 Macrotask FIFO에 모든 Timer·I/O·사용자 입력이 들어가 항상 정해진 순서로 나온다고 설명하지 않는다. 현재 Task 뒤 등의 Microtask Checkpoint에서는 대기 Microtask를 처리하며, 그 안에서 새로 넣은 Microtask도 이어 처리할 수 있다. 렌더링은 렌더링 기회와 문서 상태에 따라 일어나므로 Task마다 반드시 한 번 그리는 것은 아니다. [HTML Event Loop와 Microtask](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)

다음 예제에서는 동기 코드와 후속 작업의 출력 순서를 확인한다. 여기서는 같은 동기 구간에서 이미 fulfilled인 Promise의 Handler와 Timer를 등록한다. 이 조건에서의 순서를 모든 I/O 이벤트의 전역 우선순위로 일반화하지 않는다.

```run-javascript
console.log('1: 동기');
setTimeout(() => console.log('4: 타이머'), 0);
Promise.resolve().then(() => console.log('3: 프로미스'));
console.log('2: 동기');
```

Node.js v22.19.0 실행 결과:

```text
1: 동기
2: 동기
3: 프로미스
4: 타이머
```

Timer의 0은 즉시 실행 시각이 아니다. 현재 JavaScript 실행과 Microtask 처리가 먼저 끝나야 한다. Microtask를 끊임없이 추가하면 다음 Task와 화면 갱신도 밀릴 수 있다. Node.js에는 별도의 Phase와 `process.nextTick()` 처리가 있으므로 Browser 설명을 그대로 모든 Node 실행 모드의 순서표로 사용하지 않는다.

## async로 감싸도 계산은 현재 실행 흐름을 차지한다

I/O-bound 작업은 기다림을 외부에 맡길 수 있지만, CPU-bound 계산은 CPU를 사용해야 진행된다. 다음 예제는 긴 Busy Loop로 화면을 멈추게 하는 대신 작은 유한 합산으로 실행 순서만 확인한다. Browser와 Node.js에서 사용할 수 있으며 성능 벤치마크는 아니다.

```run-javascript
const events = [];
setTimeout(() => {
  events.push("timer");
  const actual = events.join(" -> ");
  console.log(actual);
  if (actual !== "계산 시작 -> 계산 끝 -> 호출 뒤 -> then -> timer") {
    throw new Error("실행 순서 불일치");
  }
}, 0);
async function calculate() {
  events.push("계산 시작");
  let sum = 0;
  for (let i = 1; i <= 10000; i++) sum += i;
  events.push("계산 끝");
  return sum;
}
const result = calculate();
events.push("호출 뒤");
result.then(sum => {
  if (sum !== 50005000) throw new Error("합계 불일치");
  events.push("then");
});
```

Node.js v22.19.0 실행 결과:

```text
계산 시작 -> 계산 끝 -> 호출 뒤 -> then -> timer
```

`async`가 붙어 있어도 이 함수에는 `await`가 없어 합산을 끝낸 뒤에 호출 다음 줄로 넘어간다. `Date.now()`를 검사하는 5초 Busy Loop도 같은 점유 문제를 일으키지만, Wall Clock 변화와 스케줄링까지 고려하면 정확한 5초 실행 보장으로 읽을 수 없다.

Browser 메인 Thread의 긴 작업은 입력 Handler·DOM 갱신·렌더링 작업을 지연시킨다. 일부 스크롤과 합성은 별도 실행 경로에서 진행될 수 있으므로 Browser의 모든 Thread와 네트워크까지 정지했다고 표현하지 않는다. 계산을 작은 Task로 나누어 양보하거나 [Web Worker](/wiki/frontend-web-worker-64466876b451/)로 분리할 수 있으며, 분리 비용과 실제 응답성을 측정해 선택한다. [Chromium의 Main·Compositor 분리](https://developer.chrome.com/docs/chromium/renderingng-architecture)
