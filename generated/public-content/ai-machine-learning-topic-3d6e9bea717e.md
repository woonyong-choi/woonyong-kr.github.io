---
layout: default
title: 경사 하강법
nav_order: 6
permalink: /wiki/ai-machine-learning-topic-3d6e9bea717e/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/ai-machine-learning-topic-3d6e9bea717e
projection_sha256: 2d644919a9790a6cd836579839a22243c490f1adf4a14129a14f6794ab557fbc
parent: 딥러닝
content_status: ready
public_parent_id: Wiki/ai-machine-learning/deep-learning
grand_parent: AI
---

# 경사 하강법
{: .no_toc }

## 기울기는 국소적인 이동 방향을 알려 준다

경사 하강법은 `x_new=x-lr·∇f(x)`로 파라미터를 갱신한다. 미분 가능한 함수에서 gradient는 유클리드 거리를 기준으로 함숫값이 가장 빠르게 증가하는 국소 방향이다. 0이 아닌 gradient의 반대 방향으로 충분히 작게 이동하면 감소를 기대할 수 있지만 임의의 큰 보폭까지 손실 감소를 보장하지 않는다.

기울기는 수식·역전파·수치 미분 등으로 구할 수 있다. 경사 하강법은 그 값을 이동으로 바꾸는 규칙이다. 미니배치 SGD는 전체 손실 대신 샘플 묶음에서 gradient를 추정하므로 각 update 뒤 전체 손실이 항상 감소하는 것도 아니다.

## 이차함수에서 학습률의 경계를 계산한다

`f(x)=x²+x`의 gradient는 `2x+1`이고 최소점은 -0.5다. 오차 `e=x+0.5`를 정의하면 `e_new=(1-2lr)e`가 된다. 시작점이 이미 최소점인 예외를 제외하면 `|1-2lr|<1`, 즉 `0<lr<1`에서 수렴한다. lr=0.5는 한 번에 최소점으로 이동하고, lr=1은 오차 부호만 바꿔 진동하며, lr>1은 오차 크기를 키운다.

아래는 학습률을 바꾼 독립적인 이차함수 모형이다. 신경망의 권장 학습률을 찾는 실험은 아니다.

```run-python
for lr in [0.1, 0.5, 1.0, 1.5]:
    x = 1.0
    path = [x]
    for _ in range(4):
        x -= lr * (2*x + 1)
        path.append(round(x, 6))
    print(f"lr={lr}: {path}")
```

Python 3.9.6에서 확인한 출력이다.

```text
lr=0.1: [1.0, 0.7, 0.46, 0.268, 0.1144]
lr=0.5: [1.0, -0.5, -0.5, -0.5, -0.5]
lr=1.0: [1.0, -2.0, 1.0, -2.0, 1.0]
lr=1.5: [1.0, -3.5, 5.5, -12.5, 23.5]
```

다변수 이차함수도 방향별 곡률이 달라 같은 학습률에서 진동과 느린 이동이 함께 나타날 수 있다. 비볼록 신경망에서는 안장점·평평한 영역·잡음·초기화까지 영향을 주므로 단일 함수의 수렴 경계를 그대로 옮기지 않는다. 작은 학습률이 지역 최소점에 갇히는 유일한 원인도 아니다.

## 수치 미분으로 gradient를 구할 때

배열의 한 성분만 ±h로 바꾸고 다른 성분을 고정해 중앙 차분을 구한다. 원래 배열은 float로 복사하고 각 평가가 끝나면 수정값을 복원해야 한다. 평가 함수가 오류를 낼 때도 원본을 돌려놓는 것이 안전하다. 이 방식은 파라미터별로 loss를 두 번 계산하므로 실제 큰 신경망의 학습 루프에는 역전파를 사용한다.

레이어 파라미터를 dict로 관리한다면 `params[key] -= lr*grads[key]`를 각 key에 적용한다. W·b·gamma·beta의 shape와 gradient가 대응해야 한다. [Momentum·Adam](/wiki/ai-machine-learning-topic-63f78704eb10/)은 여기에 과거 gradient 상태를 더하는 별도의 갱신 규칙이며, 경사 하강법보다 항상 우수한 후속 단계라고 단정하지 않는다.

HyeYeon의 학습률 실험에서 다루는 lr=0.5의 효과도 해당 이차함수에서의 특수한 결과다. 위 예제는 갱신식을 네 번 적용한 값만 보여 주며, 당시 그래프의 생성 시간은 재측정하지 않았다. 이 결과로 신경망의 권장 학습률이나 실행 속도를 판단할 수는 없다. [경사하강법 학습률 실험 보고서 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/src/study/HyeYeon/learning%20rate/gradient_descent_lr_report.md)
