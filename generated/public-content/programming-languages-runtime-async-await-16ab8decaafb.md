---
layout: default
title: async와 await
nav_order: 8
permalink: /wiki/programming-languages-runtime-async-await-16ab8decaafb/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-async-await-16ab8decaafb
projection_sha256: 20f274aa744ed2c9f931314de2a624191e2d79341a023ec38ad4e65253932283
parent: JavaScript
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/javascript
grand_parent: 프로그래밍 언어
ancestor: Programming
---

# async와 await
{: .no_toc }

`async` 함수는 Promise를 반환하며, `await`는 그 함수의 이어지는 실행을 Promise의 결과와 연결한다. 새 Thread를 만들거나 계산을 자동으로 백그라운드에 보내는 문법은 아니다.

## 함수의 중단과 Thread의 점유

`async` 함수의 첫 `await`에 이르기 전 코드는 호출 시 동기적으로 실행된다. `await`의 오른쪽 표현식도 먼저 평가하므로 `await heavyCalculation()`의 계산이 동기 함수라면 그 계산부터 현재 Thread를 차지한다.

Promise가 fulfilled이면 `await` 표현식은 그 값을 돌려주고, rejected이면 실패 이유를 던진다. 이미 fulfilled인 Promise나 일반 값을 기다려도 함수의 나머지는 후속 Job으로 이어진다. 현재 호출자는 먼저 실행을 계속할 수 있다. 이를 메인 Thread 전체를 재우는 Blocking 호출과 구별한다. [async 함수의 실행 구간](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function), [await의 값과 rejection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)

음료가 나올 때까지 자신의 다음 행동을 미룬다고 카페 전체가 멈추지는 않는다. 그러나 다음 행동에 긴 계산을 넣으면 실행을 재개한 뒤에는 다시 Thread를 오래 점유할 수 있다. `await Promise.resolve()`를 반복하는 것만으로 Browser가 반드시 화면을 그리거나 Timer를 처리할 기회를 얻는 것도 아니다.

## 앞 결과에 의존하는 작업은 순서대로 연결하기

다음은 [Promise](/wiki/programming-languages-runtime-promise-22d599aa3732/)에서 사용한 사용자→주문→결제 API를 순차적으로 읽는 설명용 발췌다. 실제 API 구현과 빈 주문 처리 정책은 호출 계약에 맞춰 정한다.

```javascript
// 예시: 같은 로직을 async/await로 — 동기 코드처럼 위에서 아래로 읽힌다
async function showPayment(userId) {
  try {
    const user = await getUser(userId);        // 완료될 때까지 이 함수만 멈춤
    const orders = await getOrders(user);      // 스레드는 그동안 다른 일 처리
    const payment = await getPayment(orders[0]);
    console.log(payment);
  } catch (err) {
    console.error(err);                        // try/catch로 동기처럼 오류 처리
  }
}
```

`try/catch`는 이 함수가 `await`한 rejection을 잡는다. 이 발췌의 `catch`는 출력 후 다시 던지지 않으므로 처리한 실패도 `showPayment()`의 fulfilled 결과로 끝난다. 상위 호출자에게 실패를 전파하려면 다시 던지는 등의 계약이 필요하다. 함수가 반환한 Promise도 호출자가 기다리거나 실패를 처리해야 한다. Callback에서 나중에 던진 오류나 반환하지 않은 별도 Promise까지 이 `try/catch`에 자동으로 들어오지는 않는다.

## 독립 작업을 먼저 시작하고 함께 기다리기

`await first(); await second();`는 두 번째 작업의 시작도 첫 번째 결과 뒤로 미룬다. 독립적인 작업은 먼저 둘 다 호출하고 `Promise.all()`로 결과를 기다릴 수 있다. `Promise.all()`이 함수를 대신 호출하거나 CPU 계산을 병렬화하는 것은 아니다. 하나가 실패해도 나머지 작업을 자동 취소하지는 않는다.

아래 예제는 Browser와 Node.js에서 실행되는 Promise 흐름이다. 실제 I/O나 시간 측정 없이 두 작업의 시작, 호출자의 계속 실행, 결과 수거와 rejection을 확인한다.

```run-javascript
function start(name, fail = false) {
  console.log(`시작: ${name}`);
  return fail ? Promise.reject(new Error(name)) : Promise.resolve(name);
}
async function main() {
  const first = start("A");
  const second = start("B");
  const values = await Promise.all([first, second]);
  if (values.join(",") !== "A,B") throw new Error("결과 순서 불일치");
  console.log(`수거: ${values.join(",")}`);
  try {
    await start("실패", true);
    throw new Error("실패가 성공으로 바뀜");
  } catch (error) {
    if (error.message !== "실패") throw error;
    console.log(`catch: ${error.message}`);
  }
}
const pending = main();
console.log("호출자는 계속 실행");
await pending;
```

예상 출력:

```text
시작: A
시작: B
호출자는 계속 실행
수거: A,B
시작: 실패
catch: 실패
```

긴 동기 계산과 Microtask가 다른 작업에 미치는 영향은 [동시성과 병렬성](/wiki/programming-languages-runtime-topic-7a469485c717/)에서, 실제 파일 읽기의 백그라운드 구현은 [Node.js Event Loop](/wiki/programming-languages-runtime-node-js-b30d6042ec46/)에서 구분한다.
