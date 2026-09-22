---
layout: default
title: Promise
nav_order: 7
permalink: /wiki/programming-languages-runtime-promise-22d599aa3732/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-promise-22d599aa3732
projection_sha256: fdf988322f5ad288f9187b6900a4df33d570dc00043d7eb387fafecf846c3950
parent: JavaScript
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/javascript
grand_parent: 프로그래밍 언어
ancestor: Programming
---

# Promise
{: .no_toc }

Promise는 앞으로 정해질 성공 값 또는 실패 이유에 후속 동작을 연결하는 객체다. Callback, Promise, `async`/`await`는 서로 대체되는 세대 구분보다 각각의 계약과 연결 방식을 기준으로 읽는 편이 정확하다.

## Callback을 넘기는 것과 나중에 호출되는 것은 별개다

Callback은 다른 함수에 인자로 넘기는 함수다. `Array.prototype.map()`의 Callback처럼 같은 호출 안에서 실행되기도 한다. 따라서 Callback 자체가 비동기라는 뜻은 아니다. 비동기 완료 Callback은 결과가 준비된 뒤 호출한다는 해당 API의 계약을 따른다.

음료 주문에 비유하면 Callback은 완성됐을 때 연락할 함수를 넘기는 방식이고, Promise는 주문의 결과를 나중에 확인할 수 있는 객체를 받는 방식이다. 다음은 `getUser(id, 성공, 실패)` 형태의 가상 API를 사용한 설명용 발췌다.

```javascript
// 예시: 콜백 지옥 — 작업이 순서대로 이어지면 중첩이 깊어진다
getUser(userId, (user) => {            // 1단계: 유저 조회
  getOrders(user, (orders) => {        // 2단계: 그 유저의 주문 조회
    getPayment(orders[0], (payment) => {// 3단계: 첫 주문의 결제 조회
      console.log(payment);            // 계단처럼 오른쪽으로 밀린다
    }, onError);                       // 오류 처리도 단계마다 따로
  }, onError);
}, onError);
```

조회한 사용자로 주문을 찾고 그 주문으로 결제를 조회하므로 세 작업은 순서에 의존한다. 중첩과 단계별 오류 처리는 Named Callback으로도 정리할 수 있다. Promise Chain은 반환값으로 의존 관계를 연결하고 오류를 전파하는 공통 계약을 제공한다.

## 상태와 Chain의 반환값

Promise는 pending에서 fulfilled 또는 rejected가 되며, settled 뒤에는 그 결과가 바뀌지 않는다. `resolve(otherPromise)`처럼 다른 Promise의 결과를 따르도록 고정됐어도 아직 pending일 수 있으므로 resolved와 fulfilled를 같은 뜻으로 쓰지 않는다.

`then()`은 새 Promise를 반환한다. Handler가 일반 값을 반환하면 다음 단계의 성공 값이 되고, Promise를 반환하면 그 결과를 따르며, 예외를 던지면 다음 Promise가 rejected가 된다. `catch()`는 연결된 Chain의 rejection을 처리하지만 별도로 시작한 작업까지 자동으로 수거하지는 않는다. Handler에서 후속 Promise를 반환하지 않는 Floating Promise에 주의한다. [Promise 상태와 Chain](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)

`new Promise(executor)`의 executor는 생성 중 동기적으로 호출된다. Promise 안에 긴 계산을 넣는 것만으로 다른 Thread로 이동하지 않는다. `then()` Handler는 이미 settled인 Promise에 연결해도 현재 동기 실행 구간 안에서 즉시 실행되지는 않는다. [Promise constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/Promise)

## 의존하는 조회와 실패를 한 Chain에서 확인하기

브라우저와 Node.js에서 같은 JavaScript로 실행할 수 있는 작은 예제다. 실제 서버 요청 대신 고정된 값을 Promise로 반환하며, 빈 주문에 대한 rejection도 확인한다.

```run-javascript
const getUser = id => Promise.resolve({ id });
const getOrders = user => Promise.resolve([{ id: user.id + 100 }]);
const getPayment = order => order
  ? Promise.resolve({ orderId: order.id, paid: true })
  : Promise.reject(new Error("주문 없음"));

await getUser(7)
  .then(user => getOrders(user))
  .then(orders => getPayment(orders[0]))
  .then(payment => {
    if (payment.orderId !== 107 || !payment.paid) throw new Error("결제 결과 불일치");
    console.log(`결제 ${payment.orderId}: ${payment.paid}`);
    return getPayment(undefined);
  })
  .then(() => { throw new Error("빈 주문이 성공으로 처리됨"); })
  .catch(error => {
    if (error.message !== "주문 없음") throw error;
    console.log(`실패 수거: ${error.message}`);
  });
```

예상 출력:

```text
결제 107: true
실패 수거: 주문 없음
```

성공 값이 다음 Handler에 전달되고, 뒤에서 발생한 rejection은 마지막 `catch()`로 간다. 같은 조회 흐름을 순차 코드로 읽는 방법과 독립 작업을 함께 기다리는 방법은 [async와 await](/wiki/programming-languages-runtime-async-await-16ab8decaafb/)에서 이어진다.
