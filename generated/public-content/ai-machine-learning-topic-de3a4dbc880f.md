---
layout: default
title: 신경망
nav_order: 2
permalink: /wiki/ai-machine-learning-topic-de3a4dbc880f/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/ai-machine-learning-topic-de3a4dbc880f
projection_sha256: 879dcd33025c5fa376420cec428d6ca2b3846bc769c364ac54181cbccd74ed1a
parent: 딥러닝
content_status: ready
public_parent_id: Wiki/ai-machine-learning/deep-learning
grand_parent: AI
---

# 신경망
{: .no_toc }

## 가중합의 경계를 여러 층으로 연결한다

두 입력이 모두 1일 때만 켜지는 AND와, 하나라도 1이면 켜지는 OR은 같은 계산에 다른 문턱을 둘 수 있다. `z=w1*x1+w2*x2+b`를 구한 뒤 `z>0`이면 1, 나머지는 0을 출력하는 방식이다. 입력마다 곱하는 w가 가중치이고, 입력에 관계없이 더하는 b가 편향이다. 이런 가중합과 계단 함수로 만든 판별기를 단일 퍼셉트론이라고 한다.

w가 0 벡터가 아니면 2차원 입력에서 `w1*x1+w2*x2+b=0`은 직선이다. w는 그 직선에 수직인 방향을 정하고 b는 위치에 관여한다. 입력 차원이 커지면 같은 식이 초평면을 만든다. ‘선형 분류기’라는 이름은 이 경계를 가리킨다. 계단 함수를 포함한 0·1 출력 자체가 선형 함수라는 뜻은 아니다.

다음 값은 가중합 식에 네 가지 이진 입력을 대입한 판별표다. 학습으로 찾은 파라미터가 아니라 사람이 정한 값이다.

| 게이트 | w1, w2, b | (0,0) | (0,1) | (1,0) | (1,1) |
|---|---|---:|---:|---:|---:|
| AND | 0.5, 0.5, -0.7 | 0 | 0 | 0 | 1 |
| OR | 0.5, 0.5, -0.2 | 0 | 1 | 1 | 1 |
| NAND | -0.5, -0.5, 0.7 | 1 | 1 | 1 | 0 |
| XOR | NAND와 OR의 출력을 AND로 연결 | 0 | 1 | 1 | 0 |

같은 입력 순서에서 AND의 z는 `[-0.7,-0.2,-0.2,0.3]`, OR의 z는 `[-0.2,0.3,0.3,0.8]`이다. OR은 b를 -0.7에서 -0.2로 **높여**, 넘어야 할 입력 가중합의 문턱 `-b`를 낮춘다. NAND는 AND에서 구한 z의 부호를 바꾼다. 이 네 입력에는 z=0이 없으므로 출력이 반대가 되지만, 일반 실수 입력의 z=0에서는 두 계단 함수가 모두 0이어서 부호 반전만으로 항상 논리 부정이 되지는 않는다.

### XOR은 중간 표현을 바꿔 나눈다

XOR의 양성 입력은 (0,1)·(1,0), 음성 입력은 (0,0)·(1,1)이다. 직선 하나로 가능하다고 가정하면 음성 조건에서 `b≤0`, `w1+w2+b≤0`을 얻는다. 양성 조건 둘을 더하면 `w1+w2+2b>0`이어야 한다. 하지만 앞의 두 음성 조건을 더한 결과는 `w1+w2+2b≤0`이므로 모순이다.

은닉층에 `s1=NAND(x1,x2)`, `s2=OR(x1,x2)`를 두면 이 네 점을 새로운 좌표로 옮길 수 있다. (0,0)은 (1,0), 두 양성 입력은 모두 (1,1), (1,1)은 (0,1)이 된다. 이 공간에서는 마지막 AND가 (1,1)만 선택한다. 이것이 `XOR=AND(NAND,OR)`인 두 층의 계산이다. 입력을 받기만 하는 층을 제외하면 은닉층 하나와 출력층 하나다.

입력 (1,0)은 첫 층의 z가 각각 0.2·0.3이어서 (s1,s2)=(1,1)이 되고, 마지막 AND의 z=0.3에서 1을 출력한다. 입력 (1,1)은 z가 -0.3·0.8이어서 (s1,s2)=(0,1)이 되고, 마지막 z=-0.2에서 0을 출력한다. 두 입력이 통과한 연산은 같고, 중간 표현이 다르다.

행벡터 `X=[x1,x2]`를 쓰면 은닉층의 두 판별을 `Z1=X@W1+b1`로 묶는다. 이때 `W1=[[-0.5,0.5],[-0.5,0.5]]`, `b1=[0.7,-0.2]`이며 W1의 각 열이 NAND·OR의 가중치다. `H=1{Z1>0}` 뒤에 `Z2=H@[0.5,0.5]-0.7`을 계산한다. 여러 뉴런의 가중합을 행렬곱으로 묶는 형태가 MLP의 Affine 층으로 이어진다. 비선형 단계를 모두 없애고 Affine만 합성하면 다시 하나의 Affine이므로 층 수만 늘려서는 XOR 경계를 만들 수 없다.

### 가중치를 정하는 방법을 구분한다

고전적인 퍼셉트론 연구는 Frank Rosenblatt의 1957년 보고서로 거슬러 올라간다. 오늘날의 작은 계단 판별 예제와 당시 지각·학습 시스템 전체를 동일시하지는 않는다. [Rosenblatt의 1957년 보고서](https://bpb-us-e2.wpmucdn.com/websites.umass.edu/dist/a/27637/files/2016/03/rosenblatt-1957.pdf)

NumPy의 `sum(w*x)+b`나 PyTorch의 `nn.Linear(2,1)`은 위 가중합을 계산할 수 있다. PyTorch Linear는 `(out_features,in_features)` 가중치를 저장하므로 AND의 weight는 `[ [0.5,0.5] ]`, bias는 `[-0.7]`이다. 값을 직접 넣고 비교 연산으로 판별하는 것은 수동 설정한 추론이다. `z>0` 비교에서 일반적인 autograd 연결은 이어지지 않는다. 계단 함수가 0에서 미분 불가능하고 다른 위치에서 미분이 0이라는 수학적 성질과, PyTorch 비교 연산이 미분 경로를 만들지 않는다는 구현 계약을 구분한다. [PyTorch autograd가 지원하는 tensor 타입](https://docs.pytorch.org/docs/2.9/autograd.html)

고전 퍼셉트론의 오분류에 따른 갱신 규칙은 이런 계단 함수를 직접 미분하는 방법이 아니다. 미분 가능한 MLP에서는 은닉층의 Sigmoid·ReLU 등을 거쳐 손실을 만들고, `zero_grad → loss.backward → optimizer.step`으로 파라미터를 갱신한다. 역전파는 미분값을 계산하고 optimizer가 실제 값을 바꾼다.

2→2→1 XOR 학습 예제에서 은닉·출력에 Sigmoid를 쓰면 출력 확률에 `BCELoss`를 적용할 수 있다. 출력 Sigmoid를 생략하면 logits를 받는 `BCEWithLogitsLoss`와 짝을 맞춘다. 작은 XOR 데이터라도 초기값·optimizer·학습률에 따라 실패할 수 있다. PyTorch 실습에서는 seed=0, SGD 학습률 1.0, 5,000회 갱신을 사용했다. 이 설정만으로 수렴이 보장되지는 않는다. [결합 이진 분류 손실의 입력 계약](https://docs.pytorch.org/docs/stable/generated/torch.nn.BCEWithLogitsLoss.html)

### XOR의 가중치를 손실에서 학습한다

앞의 NAND·OR 조합은 정답이 나오도록 가중치를 직접 정했다. 이번에는 XOR의 네 입력과 정답만 주고 은닉 뉴런 두 개, 출력 뉴런 하나의 가중치와 편향을 갱신한다. 아래 코드는 Python 표준 라이브러리로 만든 독립 학습 예제다.

`Random(0)`에서 파라미터 9개를 `[-1/sqrt(2),1/sqrt(2)]` 균등분포로 뽑는다. 은닉층과 출력층에 모두 Sigmoid를 쓰며, 네 샘플의 평균 Binary Cross Entropy를 최소화한다. 난수 seed 번호가 같아도 Python Random과 PyTorch가 뽑는 초기값은 같지 않다. 학습률 1.0과 5,000회 update는 원래 실습과 같지만, 아래 출력은 이 Python 구현을 실행한 결과다.

출력 logit z와 정답 y의 BCE는 `max(z,0)-y*z+log1p(exp(-abs(z)))`로 계산한다. 확률을 clip한 뒤 log를 취하지 않아 수치 미분과 해석 미분이 같은 함수를 비교한다. 출력의 국소 gradient는 평균 분모를 포함한 `d=(sigmoid(z)-y)/4`다. 은닉 출력 h_j에 대해 출력 가중치의 gradient는 `d*h_j`, 은닉 logit의 gradient는 `d*w_out_j*h_j*(1-h_j)`가 된다. 모든 샘플의 기여를 합한 뒤 `parameter -= learning_rate*gradient`로 한 번에 갱신한다.

학습에 앞서 초기 파라미터 9개 전체를 중앙 차분 h=1e-5와 대조한다. 검사를 통과한 바로 그 초기값에서 네 샘플을 모두 사용하는 full-batch 경사 하강을 5,000회 실행한다. 모멘텀·정규화·학습률 변경·seed 탐색은 사용하지 않는다.

```run-python
from math import exp, isfinite, log1p, sqrt
from random import Random

data = [((0.0,0.0),0.0), ((0.0,1.0),1.0),
        ((1.0,0.0),1.0), ((1.0,1.0),0.0)]
seed, learning_rate, updates = 0, 1.0, 5000
rng = Random(seed)
bound = 1/sqrt(2)
# W_hidden rows: 0..3; b_hidden: 4..5; W_output: 6..7; b_output: 8.
parameters = [rng.uniform(-bound,bound) for _ in range(9)]

def sigmoid(z):
    if z >= 0:
        return 1/(1+exp(-z))
    e = exp(z)
    return e/(1+e)

def forward(parameters, x):
    hidden = [sigmoid(sum(parameters[2*j+i]*x[i] for i in range(2))
                      + parameters[4+j]) for j in range(2)]
    logit = sum(parameters[6+j]*hidden[j] for j in range(2))+parameters[8]
    return hidden, logit, sigmoid(logit)

def loss_gradient(parameters):
    loss, gradient = 0.0, [0.0]*9
    for x, y in data:
        hidden, z, probability = forward(parameters,x)
        loss += (max(z,0)-y*z+log1p(exp(-abs(z))))/len(data)
        delta = (probability-y)/len(data)
        gradient[8] += delta
        for j in range(2):
            gradient[6+j] += delta*hidden[j]
            local = delta*parameters[6+j]*hidden[j]*(1-hidden[j])
            gradient[4+j] += local
            for i in range(2):
                gradient[2*j+i] += local*x[i]
    return loss, gradient

initial_loss, analytic = loss_gradient(parameters)
initial_parameters = parameters[:]
h, errors = 1e-5, []
for index in range(len(parameters)):
    plus, minus = parameters[:], parameters[:]
    plus[index] += h
    minus[index] -= h
    numeric = (loss_gradient(plus)[0]-loss_gradient(minus)[0])/(2*h)
    errors.append(abs(numeric-analytic[index]))
print(f'gradient_max_abs_error={max(errors):.3e}')
assert max(errors) < 1e-8
assert parameters == initial_parameters
print(f'seed={seed} learning_rate={learning_rate} updates={updates}')
print('initial_parameters', [round(v,6) for v in parameters])
print(f'initial_mean_bce={initial_loss:.9f}')

for _ in range(updates):
    loss, gradient = loss_gradient(parameters)
    assert isfinite(loss) and all(isfinite(g) for g in gradient)
    parameters = [value-learning_rate*g for value,g in zip(parameters,gradient)]

final_loss, _ = loss_gradient(parameters)
print(f'final_mean_bce={final_loss:.9f}')
correct = 0
for x, y in data:
    probability = forward(parameters,x)[2]
    prediction = int(probability >= 0.5)
    correct += prediction == int(y)
    print(tuple(int(v) for v in x), f'p={probability:.6f}',
          f'prediction={prediction} target={int(y)}')
print(f'correct={correct}/{len(data)}')
```

Python 3.9.6에서 한 번 실행한 결과다.

```text
gradient_max_abs_error=8.585e-12
seed=0 learning_rate=1.0 updates=5000
initial_parameters [0.487086, 0.364803, -0.112329, -0.340943, 0.015945, -0.134443, 0.401352, -0.278158, -0.033097]
initial_mean_bce=0.693980950
final_mean_bce=0.002140256
(0, 0) p=0.002719 prediction=0 target=0
(0, 1) p=0.998079 prediction=1 target=1
(1, 0) p=0.998079 prediction=1 target=1
(1, 1) p=0.001990 prediction=0 target=0
correct=4/4
```

초기 파라미터 9개의 gradient는 중앙 차분과 최대 약 8.585×10⁻¹² 차이로 일치했다. 그 상태에서 5,000회 갱신한 뒤 평균 BCE가 약 0.694에서 0.00214로 줄었고, 0.5를 기준으로 나눈 네 판정이 XOR의 정답과 같아졌다. 손실이 정확히 0이 되거나 모든 초기값에서 같은 결과가 나온다는 뜻은 아니다. 판별을 확인한 대상은 학습에 사용한 네 이진 입력이며, 연속 입력의 일반화나 다른 데이터의 정확도는 측정하지 않았다.

현재 MNIST의 `Affine`은 입력 `(N,784)`를 W `(784,512)`와 곱해 `(N,512)`로 바꿀 수 있다. ReLU는 계단 함수처럼 양수를 1로 바꾸지 않고 그 값을 유지한다. 같은 가중합에서 출발해도 선택한 활성화와 가중치를 정하는 방법에 따라 프로그램의 역할이 달라진다. [Affine 구현](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/layers.py), [활성화 함수](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/activations.py)

## 앞선 계산을 참조하는 방향으로 구조를 읽는다

첫 Affine의 출력이 다음 활성화의 입력이 되고, 그 결과가 다음 Affine으로 이어지면 출력까지 값을 순서대로 계산할 수 있다. 이때 이미 계산한 값을 다음 연산에서 여러 번 쓰거나 뒤쪽 층으로 건너뛰어 연결할 수도 있다. 입력에서 출력으로 가는 의존 관계에 순환이 없는 구조를 Feedforward 네트워크라고 한다. 반드시 한 줄의 층만 있어야 하는 것은 아니다.

은닉층 여러 개를 완전연결층과 활성화로 구성한 MLP는 그 한 종류다. 일반적인 CNN은 지역 합성곱과 pooling을 사용하고, Transformer는 attention과 위치별 FFN 등을 사용한다. 연산 종류가 다르더라도 한 번의 입력 계산에서 앞선 결과를 뒤에서 참조하는 방향으로 연결할 수 있다. Transformer 안의 ‘FFN’이라는 하위 블록 이름과 네트워크 전체를 판별하는 Feedforward 개념도 구분한다.

RNN에서는 이전 시점의 은닉 상태 h_(t-1)를 현재 입력 x_t와 함께 받아 h_t를 만든다. 유한한 시간 길이로 펼치면 이 계산 역시 비순환 그래프로 그릴 수 있지만, 시간 단계 사이에서 상태를 반복 사용하는 모델이라는 점이 사라지지는 않는다. Feedforward와 RNN을 구분할 때는 펼친 그림의 화살표뿐 아니라 이전 단계의 상태를 다음 단계로 넘기는 규칙을 확인해야 한다.

Feedforward라고 해서 시계열이나 가변 길이 입력을 다룰 수 없는 것은 아니다. 과거 여러 시점의 값을 입력 벡터로 주거나, 위치 정보를 포함한 전체 sequence를 attention으로 처리할 수 있다. 원래 Transformer도 recurrence 없이 sequence를 처리하도록 제안되었다. 생성된 토큰을 다시 넣는 autoregressive 실행 반복은 한 번의 Transformer 계산과 다른 범위다. [Transformer의 recurrence 없는 sequence 처리](https://arxiv.org/html/1706.03762v7)

### 실행 순서와 실행 상태를 따로 확인한다

현재 `lrn-mnist`는 `OrderedDict`에 넣은 순서대로 `out=layer.forward(out)`을 반복한다. `[512,256]` 구성에서는 `(N,784) → (N,512) → (N,256) → (N,10)`으로 폭이 바뀐다. 은닉층은 `Affine → BatchNorm(선택) → ReLU → Dropout(선택)` 순서다. 마지막 Softmax는 클래스 축을 정규화한다. 출력층은 과업의 계약에 따라 정하며 모든 분류 프로그램이 Softmax 확률을 모델 안에서 출력해야 하는 것은 아니다. [MNIST의 등록 순서와 forward](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/network.py)

등록 순서를 바꾸면 함수나 shape가 달라져 오류가 생길 수 있지만, 단순히 순서를 바꿨다는 이유만으로 순환 구조가 되지는 않는다. 실제 의존 관계가 뒤의 결과를 앞의 계산에 요구하는지 따져야 한다. 학습에서 `backward`를 역순으로 호출하는 것은 이 순방향 그래프의 gradient 계산이며 RNN의 상태 되먹임과는 다르다.

‘같은 입력이면 항상 같은 출력’도 구조만으로 보장되지 않는다. Dropout은 학습 중 난수 마스크로 일부 값을 가리고, BatchNorm은 함께 들어온 배치와 누적 통계에 영향을 받는다. 그러므로 같은 샘플이라도 모드·배치·난수 상태가 다르면 결과가 달라질 수 있다. 가중치·모드·입력 전체·상태와 결정적 실행 조건을 고정한 경우에 동일 출력을 비교한다. 현재 `predict`는 `train=False`로 실행하며, 이 NumPy Dropout은 추론에서 입력에 유지 비율을 곱한다. PyTorch의 inverted dropout 규칙을 그대로 대입하지 않는다. [BatchNorm·Dropout의 상태 분기](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/layers.py)

구조를 읽을 때는 먼저 한 번의 forward가 받는 입력과 상태를 정하고, 각 연산의 의존 관계를 따라간다. 행렬 크기는 다음 MLP 계산에서, 학습·추론 상태는 BatchNorm 절에서 구체적으로 확인할 수 있다.

## MLP의 순전파를 행렬 shape로 읽는다

다층 퍼셉트론은 `Z_l=A_(l-1)W_l+b_l`, `A_l=f(Z_l)`을 반복한다. X가 `(N,I)`이고 W가 `(I,O)`이면 Z는 `(N,O)`다. 편향 `(O,)`는 N개 샘플에서 공유한다. 이 연산을 행렬곱으로 묶으면 최적화된 수치 라이브러리를 활용할 수 있지만 속도 차이는 행렬 크기·하드웨어·메모리 배치에 달려 있다.

2→3→2→2 구조는 W1 `(2,3)`, W2 `(3,2)`, W3 `(2,2)`를 갖고 배치 축 N을 유지한다. 아래 독립 계산 모형은 고정 가중치의 sigmoid 은닉층 두 개와 softmax 출력층을 계산한다. 학습된 분류기의 성능 예제가 아니다.

```run-python
from math import exp

def affine(x, w, b):
    return [sum(x[i]*w[i][j] for i in range(len(x))) + b[j]
            for j in range(len(b))]

def sigmoid(x):
    return [1/(1+exp(-v)) for v in x]

x = [1.0, 0.5]
z1 = affine(x, [[0.1,0.3,0.5],[0.2,0.4,0.6]], [0.1,0.2,0.3])
a1 = sigmoid(z1)
z2 = affine(a1, [[0.1,0.4],[0.2,0.5],[0.3,0.6]], [0.1,0.2])
a2 = sigmoid(z2)
z3 = affine(a2, [[0.1,0.3],[0.2,0.4]], [0.1,0.2])
e = [exp(v-max(z3)) for v in z3]
p = [v/sum(e) for v in e]
for name, values in [('z1',z1),('a1',a1),('z2',z2),('a2',a2),('z3',z3),('p',p)]:
    print(name, [round(v,6) for v in values])
```

Python 3.9.6에서 확인한 출력이다.

```text
z1 [0.3, 0.7, 1.1]
a1 [0.574443, 0.668188, 0.75026]
z2 [0.51616, 1.214027]
a2 [0.626249, 0.771011]
z3 [0.316827, 0.696279]
p [0.406259, 0.593741]
```

마지막 Affine의 z3에 Softmax를 적용하면 확률 p가 된다. 두 성분에 지수 함수를 적용한 뒤 그 합으로 나누는 계산이다. 출력층을 항등 함수로 두는 경우에는 z3 자체가 최종 출력이다.

NumPy에서는 각 층을 직접 호출하거나 OrderedDict의 등록 순서대로 forward한다. PyTorch의 `nn.Module`은 파라미터와 하위 모듈을 등록하고 `nn.Sequential`은 단순 직렬 실행을 표현한다. PyTorch Linear의 가중치 shape는 `(out_features,in_features)`이므로 위 행벡터 수식의 W를 이식할 때 전치가 필요하다. logits를 [CrossEntropyLoss](/wiki/ai-machine-learning-topic-7c39d8d61e07/)에 넣는 경로에는 별도 softmax를 중복 적용하지 않는다.

## 넓이와 깊이로 표현할 수 있는 함수를 비교한다

XOR에서는 은닉층이 만든 좌표를 출력층이 조합했다. 연속적인 곡선을 출력하려면 은닉 뉴런의 값을 0·1 판정 대신 가중합으로 모을 수 있다. 예를 들어 `f_N(x)=c+Σ_i v_i·σ(w_i·x+b_i)`는 은닉층 하나와 선형 출력층을 가진 함수다. N은 은닉 뉴런 수이고, v_i는 각 뉴런의 출력에 곱하는 가중치다.

보편 근사 정리는 적절한 활성화와 편향을 사용하고 폭을 충분히 늘릴 수 있을 때, 이 함수족의 표현 범위가 넓다는 사실을 설명한다. 여기서는 컴팩트 집합 K, 즉 유한 차원에서 닫히고 유계인 입력 범위의 연속 함수 f를 다룬다. 어떤 오차 ε>0을 정하든 K 전체에서 `sup |f(x)-f_N(x)|<ε`가 되도록 하는 **유한한 N과 파라미터가 존재한다**는 형태다. 정확한 오차 0이나 모든 실수 영역의 동시 근사를 뜻하지 않는다.

### 활성화와 오차 기준의 조건

Cybenko의 1989년 결과는 연속적인 sigmoidal 활성화의 유한 선형 결합을 다뤘다. Hornik의 1991년 결과에서는 연속·유계·비상수 활성화가 컴팩트 집합 위 연속 함수를 균등 근사하는 충분조건이다. 단조 증가를 이 두 결과의 공통 필수조건으로 묶지 않는다. [Cybenko의 정리](https://link.springer.com/article/10.1007/BF02551274), [Hornik의 정리 2](https://web.njit.edu/~usman/courses/cs675_fall18/hornik-nn-1991.pdf)

ReLU는 유계가 아니므로 그 충분조건에 직접 끼워 넣을 수 없다. 연속 활성화의 경우, 편향을 허용한 이러한 단일 은닉층 함수족에서 비다항식이라는 조건으로 근사 가능성을 설명할 수 있다. ReLU도 이에 포함된다. ‘비선형이면 모두 된다’고 줄이면 x² 같은 고정 다항식 활성화의 반례를 놓친다. 한 은닉층에서 `(w·x+b)²`를 아무리 더해도 전체 차수는 2를 넘지 않는다. [Leshno·Lin·Pinkus·Schocken의 비다항식 조건](https://pinkus.net.technion.ac.il/files/2021/02/neural.pdf)

Sigmoid는 위치가 다른 부드러운 계단을 만든다. 두 계단의 **차**를 적절히 취하면 부드러운 펄스 모양을 만들 수 있지만, 같은 부호로 단순히 더하면 사각 펄스가 되지 않는다. ReLU는 꺾이는 직선을 만들고 그 가중합은 구간별 선형 함수를 만든다. 가중치와 편향은 꺾이는 위치·기울기·방향을 정한다.

### ReLU의 꺾임으로 sin 곡선을 연결한다

`[-π,π]`를 m개 구간으로 나누고 이웃한 sin 값을 직선으로 이으면, 각 구간의 기울기를 ReLU의 가중치로 직접 표현할 수 있다. 첫 구간의 기울기는 왼쪽 끝에서 켜지는 ReLU에 주고, 내부 경계마다 바뀌는 기울기만 더한다. 출력 편향은 왼쪽 끝의 sin 값이다. 이 구성은 해당 구간에서 은닉 뉴런 m개와 선형 출력층 하나로 계산된다.

아래 예제는 학습이나 난수 초기화 없이 파라미터를 계산한다. 오차는 끝점을 포함한 2,001개 공통 평가점에서 측정하며 연속 구간 전체를 전수 조사한 값은 아니다. sin의 두 번째 미분 절댓값이 1 이하이므로 간격 h인 선형 보간의 이론적 최대 오차 상한 `h²/8`도 함께 비교한다.

```run-python
from math import fsum, pi, sin

left, right = -pi, pi
grid = [left+(right-left)*i/2000 for i in range(2001)]

for width in [4, 16, 64]:
    knots = [left+(right-left)*i/width for i in range(width+1)]
    values = [sin(x) for x in knots]
    slopes = [(values[i+1]-values[i])/(knots[i+1]-knots[i])
              for i in range(width)]
    weights = [slopes[0]] + [slopes[i]-slopes[i-1]
                            for i in range(1,width)]

    def predict(x):
        return values[0]+fsum(w*max(0.0,x-t)
                              for w,t in zip(weights,knots[:-1]))

    errors = [predict(x)-sin(x) for x in grid]
    mse = fsum(e*e for e in errors)/len(grid)
    maximum = max(abs(e) for e in errors)
    bound = ((right-left)/width)**2/8
    print(f'width={width:2d} grid_mse={mse:.9f} '
          f'grid_max_abs={maximum:.9f} interval_bound={bound:.9f}')
    assert maximum <= bound+1e-12
    assert max(abs(predict(x)-y) for x,y in zip(knots,values)) < 1e-12
```

Python 3.9.6에서 확인한 출력이다.

```text
width= 4 grid_mse=0.022752488 grid_max_abs=0.210513243 interval_bound=0.308425138
width=16 grid_mse=0.000098375 grid_max_abs=0.018846269 interval_bound=0.019276571
width=64 grid_mse=0.000000387 grid_max_abs=0.001202377 interval_bound=0.001204786
```

같은 평가점에서 구간을 더 잘게 나눌수록 오차가 줄었다. 보간점에서는 sin 값과 맞지만, 이것은 알려진 함수값으로 직접 만든 1차원 구성이다. 모든 함수의 학습이나 보편 근사 정리의 증명을 이 실행으로 대신하지 않는다.

### 파라미터 수와 학습 가능성은 다른 질문이다

MNIST의 `hidden_sizes`를 바꾸면 폭과 은닉층 수가 바뀐다. 다음 수는 Affine의 W·b만 센 산술값이다. BatchNorm의 gamma·beta와 optimizer 상태, 학습 중 활성화 메모리는 포함하지 않는다.

| 구조 | W 원소 수 | b 원소 수 | Affine 파라미터 합 |
|---|---:|---:|---:|
| 784→2048→10 | 1,626,112 | 2,058 | 1,628,170 |
| 784→512→256→10 | 535,040 | 778 | 535,818 |

깊은 구성의 W 수는 `784*512+512*256+256*10=535,040`이다. 폭을 줄인 두 층 구성에서 수가 작아졌다는 계산만으로 같은 함수를 더 잘 근사하거나 MNIST 정확도가 높다고 결론 내릴 수 없다. 특정 함수족에서는 깊이를 제한하면 같은 근사에 훨씬 많은 뉴런이 필요하다는 depth separation 결과가 있다. 그 존재 결과를 모든 데이터와 모델의 성능 우위로 확대하지 않는다. [Telgarsky의 깊이 분리 결과](https://proceedings.mlr.press/v49/telgarsky16.html)

앞 층의 표현을 뒤 층에서 다시 조합한다는 설명은 가능하다. 다만 학습한 MLP의 앞 층이 반드시 모서리, 뒤 층이 반드시 숫자를 맡는다고 지정할 수는 없다. 그런 해석은 실제 활성화나 가중치를 관찰해 확인해야 한다.

무작위 W·b를 고정한 `H=ReLU(XW+b)`에 대해 `lstsq(H,y)`로 v만 구하는 실습도 다른 비교 방법이다. 기존 실습은 `[-π,π]`의 200개 점, 폭 `[3,10,50]`, seed=42를 사용하고 W·b를 표준정규 난수의 두 배로 만들었다. 이것은 전체 MLP를 SGD로 학습하는 과정이 아니라 고정된 특징의 선형 최소제곱 적합이다. 상수 열을 더하지 않은 H에는 독립 출력 편향 c도 없다.

폭마다 seed를 다시 설정해도 배열 shape와 난수 소비 순서가 달라지면 동일한 특징을 포함하는 비교가 아니므로 오차가 항상 감소한다고 보장할 수 없다. 적합한 점에서의 MSE와 별도 평가점의 오차도 구분한다. 그 random-feature 실습의 MSE는 여기서 다시 측정하지 않았으며, 위 ReLU 보간 출력은 다른 파라미터 구성과 2,001개 평가점을 사용한 결과다.

각 ε>0에 대해 유한한 근사망이 존재한다는 정리는 효율적으로 크기를 찾는 절차, 정해진 SGD의 수렴, 보지 않은 데이터에서의 일반화까지 보장하지 않는다. 임의의 한 폭이 모든 함수·모든 ε에 충분하다는 뜻도 아니다. 표현할 수 있는지, 주어진 예산으로 학습할 수 있는지, 평가 데이터에서 맞는지를 나누어 판단한다.

## 같은 shape를 유지해도 층의 책임은 다르다

MNIST의 `(128,784)` 입력에 `(784,512)` W를 곱하면 `(128,512)`가 된다. 뒤의 BatchNorm·ReLU·Dropout은 shape를 유지하지만 Affine은 W·b, BatchNorm은 gamma·beta를 학습하고 ReLU·Dropout은 backward에 필요한 마스크를 저장한다. 모든 층을 통과한 고정 가중치의 추론과, loss에서 gradient를 계산해 갱신하는 학습은 별개다.

현재 `lrn-mnist`의 은닉층 순서는 `Affine → BatchNorm(선택) → ReLU → Dropout(선택)`이며 마지막 Affine 뒤 softmax가 클래스 점수를 확률로 바꾼다. BatchNorm과 Dropout은 train/inference 분기가 필요하다. [현재 network 구현](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/network.py)

HyeYeon의 한 층 흐름 노트는 작은 `(2, 3) → (2, 2)` 배열에서 Affine → BatchNorm → ReLU → Dropout의 계산을 추적한다. 고정 가중치로 출력을 계산하는 과정과 gradient로 가중치를 갱신하는 과정을 구분해 읽을 수 있다. 그 노트의 숫자는 당시 설명용 예시이며, 위 독립 순전파 모형의 실행 결과와는 별개다. [03. 신경망 순전파 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/docs/woonyong/deep-learning-from-scratch/03-neural-network-forward.md) [Affine -> BatchNorm -> ReLU -> Dropout 한 층 흐름 이해 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/src/study/HyeYeon/md/%EC%9D%80%EB%8B%89%EC%B8%B5_%EB%B8%94%EB%A1%9D_Affine_BatchNorm_ReLU_Dropout_%ED%9D%90%EB%A6%84_%EC%9D%B4%ED%95%B4.md)

## 가중치 초기화는 대칭과 신호 크기를 함께 정한다

같은 은닉층의 뉴런이 동일한 입력 가중치·편향과 대칭적인 연결에서 출발하면 출력과 gradient도 같아져 서로 다른 특징을 배우기 어렵다. 무작위 가중치는 이 대칭을 깨는 방법이다. 모든 학습 파라미터를 무조건 무작위로 만들어야 한다는 뜻은 아니다. 가중치가 이미 서로 다르면 편향을 0으로 두는 것은 흔한 선택이고, BatchNorm의 gamma=1·beta=0도 별도의 역할에 맞춘 초기값이다.

가중치가 너무 크면 가중합이 포화 구간으로 밀리거나 층을 거치며 신호가 커질 수 있다. 너무 작으면 전파되는 값과 gradient가 빠르게 줄 수 있다. 어떤 크기가 적절한지는 연결 폭과 [활성화 함수](/wiki/ai-machine-learning-topic-ff856a774938/), 정규화·residual 구성에 달려 있다. 초기화는 시작점의 신호 흐름을 조절하며 학습 이후의 모든 분포나 수렴을 보장하지 않는다.

### fan_in과 fan_out을 가중치의 사용 방향에서 센다

`z_j=Σ_i W_ij a_i`에서 fan_in은 출력 하나가 더하는 입력의 수이고 fan_out은 입력 하나가 연결되는 출력 수다. 독립적인 평균 0 가중치, 가중치와 입력의 독립성, 동일한 성분 통계 등 초기화 모형의 가정하에서는 `Var(z_j)=fan_in·Var(W)·E[a²]`로 쓸 수 있다. 입력 평균이 0일 때에만 `E[a²]=Var(a)`다. 여기서 분산은 입력·초기 가중치의 무작위성에 대한 계산이며, 고정된 가중치 한 벌의 실제 배치 통계가 항상 이 값이라는 뜻은 아니다.

평균 0의 선형 입력에서 순전파 크기를 유지하는 기본 조건은 `Var(W)=1/fan_in`이다. 순전파와 역전파의 폭을 함께 고려한 Xavier/Glorot 초기화는 gain=1일 때 `Var(W)=2/(fan_in+fan_out)`을 사용한다. 정규분포라면 표준편차는 이 값의 제곱근이고, 균등분포라면 구간은 `±sqrt(6/(fan_in+fan_out))`이다. gain을 쓰면 표준편차·구간에 gain을 곱한다. [Glorot와 Bengio의 초기화 분석](https://proceedings.mlr.press/v9/glorot10a/glorot10a.pdf)

이 분석은 활성화가 초기 입력 부근에서 어떻게 동작하는지 가정한다. Tanh는 원점 대칭이지만 Sigmoid는 그렇지 않으므로 두 함수를 모두 원점 대칭이라고 분류할 수 없다. PyTorch에서 Sigmoid의 gain=1은 기본 Xavier의 gain과 같다. Tanh의 gain=5/3을 적용하면 기본값에 비해 초기 분포의 스케일이 달라진다. 함수 이름만으로 하나의 분산식을 모든 구성에 적용하지 않는다.

NumPy의 `x@W`에서 W가 `(fan_in,fan_out)`인 것과 PyTorch Linear의 `(fan_out,fan_in)` 저장 방향은 다르다. PyTorch Kaiming 함수에 전자의 행렬을 전달하려면 W의 전치 view를 넘기는 식으로 fan 계산을 맞춘다. `fan_in` 모드는 순전파, `fan_out` 모드는 역전파의 신호 크기를 고려하는 선택이다. [PyTorch 초기화의 gain·fan·전치 계약](https://docs.pytorch.org/docs/2.9/nn.init.html)

### ReLU 뒤의 두 번째 모멘트와 분산은 다르다

평균 0의 대칭 분포 Z에서 A=max(0,Z)라면 `E[A²]=E[Z²]/2`다. 음수 쪽 제곱의 기여가 사라져 두 번째 모멘트가 절반이 된다. 하지만 A의 평균은 보통 양수이므로 `Var(A)=E[A²]-E[A]²`는 그보다 작다. 이 차이를 이용한 He 초기화의 ReLU 조건은 `Var(W)=2/fan_in`이다. [He 등의 초기화 유도, 식 7–10](https://arxiv.org/pdf/1502.01852)

특히 Z~N(0,σ²)이면 다음과 같다.

```text
E[ReLU(Z)]   = σ/sqrt(2*pi)
E[ReLU(Z)²]  = σ²/2
Var(ReLU(Z)) = σ²*(1/2-1/(2*pi))
```

ReLU 전 분산이 2이면 ReLU 뒤의 두 번째 모멘트는 1이지만 분산은 `1-1/pi≈0.681690`이다. 따라서 층의 흐름을 ‘분산 2 → ReLU → 분산 1’로 적으면 평균의 변화를 놓친다. 다음 Affine의 평균 0 가중치가 이용하는 항은 `E[A²]`이며, 이것이 He의 스케일을 설명한다.

Leaky ReLU의 초기 음수 기울기가 α이면 같은 대칭 가정에서 `E[A²]=(1+α²)E[Z²]/2`다. 이에 맞춘 fan_in 조건은 `Var(W)=2/((1+α²)fan_in)`이다. α=0이면 ReLU, α=1이면 선형 조건으로 돌아온다. PReLU에서는 초기 α로 계산하며 α가 학습된 뒤까지 초기 조건이 그대로 유지되는 것은 아니다.

폭이 같고 다른 구조 변화가 없는 단순 모형에서 gain=1 Xavier를 ReLU와 반복하면 두 번째 모멘트가 층마다 줄어드는 경향을 설명할 수 있다. 그러나 ‘5~10층이면 언제나 출력이 0이 된다’는 고정 경계는 없다. 입력 분포·폭·정규화·residual·유한 표본과 학습 중 변화가 결과를 바꾼다.

### 같은 난수 표본에 두 스케일을 적용한다

fan_in=784, fan_out=512이면 He의 표준편차는 약 0.050508, gain=1 Xavier는 약 0.039284다. 정규분포에는 유한한 상·하한이 없으며 He의 약 ±0.1515는 3σ 구간일 뿐 제한된 범위가 아니다. 균등분포 초기화의 실제 구간과 구분해야 한다.

아래 모형은 seed가 고정된 표준정규 표본 10,000개를 두 방식으로 스케일링한다. 784×512 가중치 행렬 전체를 만들거나 모델을 학습하지 않는다. 뒤에서는 정규 표본의 ±쌍을 만들어 입력 표본을 정확히 대칭으로 구성하고, ReLU 전후의 평균·두 번째 모멘트·분산을 나눠 본다. ±쌍의 절반 관계는 모형이 의도적으로 대칭을 만든 결과이며 일반 배치의 보장값은 아니다.

```run-python
from math import fsum, pi, sqrt
from random import Random

def moments(values):
    mean = fsum(values)/len(values)
    second = fsum(v*v for v in values)/len(values)
    return mean, second, second-mean*mean

rng = Random(42)
base = [rng.gauss(0,1) for _ in range(10000)]
fan_in, fan_out = 784, 512
scales = [('he',sqrt(2/fan_in)), ('xavier',sqrt(2/(fan_in+fan_out)))]
for name, scale in scales:
    values = [v*scale for v in base]
    mean, second, variance = moments(values)
    print(name, f'theory_std={scale:.6f}', f'sample_mean={mean:.6f}',
          f'sample_std={sqrt(variance):.6f}')
z = [value for v in base for value in (sqrt(2)*v,-sqrt(2)*v)]
a = [max(0.0,v) for v in z]
for name, values in [('before_relu',z), ('after_relu',a)]:
    mean, second, variance = moments(values)
    print(name, f'mean={mean:.6f}', f'second={second:.6f}', f'variance={variance:.6f}')
ratio = moments(a)[1]/moments(z)[1]
print('second_moment_ratio', round(ratio,6))
print('gaussian_after_relu_variance_theory', round(1-1/pi,6))
assert abs(ratio-0.5) < 1e-12
```

Python 3.9.6에서 확인한 출력이다.

```text
he theory_std=0.050508 sample_mean=-0.000593 sample_std=0.050485
xavier theory_std=0.039284 sample_mean=-0.000461 sample_std=0.039266
before_relu mean=0.000000 second=1.998500 variance=1.998500
after_relu mean=0.564758 second=0.999250 variance=0.680298
second_moment_ratio 0.5
gaussian_after_relu_variance_theory 0.68169
```

### 현재 MNIST와 GPT에서 초기화가 적용되는 범위

`lrn-mnist`의 `NeuralNetwork`는 `[784]+hidden_sizes+[10]`의 모든 Affine에 `randn(fan_in,fan_out)*sqrt(2/fan_in)`을 적용하고 편향을 0으로 둔다. `[784,512,256,10]` 구성의 첫 W는 `(784,512)`다. BatchNorm을 사용하는 은닉층에는 gamma=1·beta=0도 만든다. 생성자에는 Xavier를 고르는 분기가 없으며, ReLU가 없는 마지막 출력 Affine에도 같은 He 스케일을 사용하는 것이 현재 코드의 동작이다. 이것을 모든 출력층에 대한 최적 초기화 규칙으로 일반화할 수는 없다. [MNIST 초기화 코드](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/network.py)

`lrn-gpt`의 Linear·Embedding 초기화는 기본 `init_std=0.02`인 평균 0 정규분포이며 Linear bias는 0이다. ReLU용 fan_in 공식을 모든 GPT 층에 적용하지 않는다. 구성과 값을 함께 읽어야 실제 시작 분포를 알 수 있다. [GPT 초기화 함수와 기본값](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/config.py)

재현하려면 초기화 직전의 난수 상태와 실제 호출 순서를 맞춰야 한다. MNIST 학습 진입점은 NumPy seed를 설정한다. GPT의 config에 seed가 존재한다는 사실만으로 모든 생성 경로에서 seed가 적용되지는 않으며 debug 분기와 학습 진입점의 호출을 함께 확인한다. 라이브러리·장치가 달라져도 같은 seed로 모든 값이 일치한다는 보장은 없다. 위 표본 통계는 독립 계산의 결과이며 개인·팀의 MNIST 정확도나 초기화 방식의 학습 성능 비교가 아니다.

## BatchNorm은 배치 통계와 학습 파라미터를 함께 사용한다

MLP의 X가 `(N,D)`일 때 feature별로 배치 평균 μ와 분산 v를 계산한다.

```text
μ = mean(X, axis=0)
v = mean((X-μ)², axis=0)
σ = sqrt(v+eps)
X_hat = (X-μ)/σ
Y = gamma*X_hat + beta
```

μ·v는 현재 입력의 통계, gamma·beta는 optimizer가 학습하는 파라미터다. X_hat의 feature별 평균은 반올림 오차 범위에서 0이고 분산은 `v/(v+eps)`다. eps가 있으므로 정확히 1이 아니며, v=0인 feature는 X_hat=0이다. gamma·beta를 적용한 Y가 평균 0·분산 1이라는 보장도 없다. 특정 배치에서 gamma=`sqrt(v+eps)`, beta=μ로 두면 입력을 복원할 수 있지만 고정 gamma·beta가 모든 배치의 통계를 동시에 되돌리는 것은 아니다.

BatchNorm은 입력 분포 변화에 대한 문제의식에서 제안되었다. 다만 내부 공변량 이동 감소만이 성능 개선의 확정된 원인이라고 단정하지 않는다. 후속 연구는 최적화 지형의 매끄러움 등 다른 설명을 제시한다. 모델·배치·배치 통계의 대표성에 따라 효과가 달라지고 빠른 수렴이나 높은 학습률 사용은 보장되지 않는다. [BatchNorm 원 논문](https://arxiv.org/abs/1502.03167), [최적화 효과에 관한 후속 연구](https://arxiv.org/abs/1805.11604)

### 학습과 추론의 통계

현재 NumPy 구현은 학습에서 현재 배치 통계를 쓰면서 `running = 0.9*running + 0.1*batch_stat`로 평균과 분산을 누적한다. 추론에서는 누적 통계로 계산하므로 모델을 저장할 때 W·b·gamma·beta뿐 아니라 running_mean·running_var도 포함한다. NumPy 구현의 momentum 0.9는 과거 통계의 계수다. PyTorch BatchNorm의 momentum은 새 통계의 계수이며, forward와 running variance에서 사용하는 분산 추정량도 구분하므로 숫자를 그대로 옮기지 않는다. [PyTorch BatchNorm1d](https://docs.pytorch.org/docs/stable/generated/torch.nn.modules.batchnorm.BatchNorm1d.html)

NumPy 층은 `(N,...)`의 나머지 축을 평탄화해 feature별 통계를 구한다. CNN에서 공간 위치까지 묶어 채널별로 통계를 구하는 BatchNorm2d와 동일한 계약은 아니다. 한 배치에 샘플이 하나뿐이면(N=1) feature 분산이 0이 되고 신호가 크게 제한된다. 학습 직후의 추론에는 누적 통계가 얼마나 대표성을 갖는지도 영향을 준다.

### gamma·beta와 입력으로 돌아가는 gradient

상류 gradient G와 학습에서 저장한 X_hat·σ를 사용하면 다음과 같이 계산한다. 합은 배치 축으로 구한다.

```text
dbeta = Σ G
dgamma = Σ (G*X_hat)
U = G*gamma
dX = (N*U - ΣU - X_hat*Σ(U*X_hat)) / (N*σ)
```

이 식은 학습 배치 통계를 X에서 계산한 경우의 미분이다. 추론에서 고정된 running 통계를 사용하는 경우에는 `dX=G*gamma/sqrt(running_var+eps)`로 경로가 다르다. 실제 학습 코드의 backward는 직전 학습 forward의 저장값과 짝을 이뤄야 한다.

## CNN은 공간적 이웃과 가중치 공유를 연산에 넣는다

이미지를 `(N,784)`로 펼쳐도 픽셀 값과 순서는 복원할 수 있으므로 공간 정보 자체가 삭제되는 것은 아니다. 다만 완전연결층은 이웃 픽셀의 관계나 위치 간 같은 필터의 재사용을 구조적으로 강제하지 않는다. CNN은 작은 영역에 같은 필터를 적용해 지역 연결과 가중치 공유라는 가정을 넣는다.

기본적인 groups=1 합성곱에서 입력은 `(N,C_in,H,W)`, 필터는 `(C_out,C_in,FH,FW)`다. 각 필터는 입력 채널들의 지역 곱을 합해 출력 채널 하나를 만든다. 딥러닝 라이브러리에서 흔히 convolution이라고 부르는 연산은 필터를 뒤집지 않는 cross-correlation이다. 2×2 패치 `[[1,2],[3,4]]`와 필터 `[[0.1,0.2],[0.3,0.4]]`의 곱합은 3.0이다.

대칭 padding P·stride S·dilation d를 쓰면 높이는 `floor((H+2P-d*(FH-1)-1)/S)+1`이다. d=1이면 `floor((H+2P-FH)/S)+1`로 줄어든다. 너비도 같은 방식으로 계산한다. H=28, FH=3, S=1에서는 P=0이면 26, P=1이면 28이다. padding·stride·경계에서는 이동에 대한 등변성이 깨질 수 있고, CNN이 모든 위치 이동에 불변인 것은 아니다.

### im2col과 pooling

im2col은 필터가 닿는 각 패치를 행으로 펼친다. `(1,1,4,4)` 입력에 3×3 필터·stride 1·padding 0이면 패치 4개를 `(4,9)`로 만들고, 필터를 `(9,1)`로 펼쳐 `(4,1)` 결과를 구한 뒤 `(1,1,2,2)`로 돌린다. 최적화된 행렬곱을 이용할 수 있지만 겹치는 입력을 복제하므로 메모리가 늘 수 있다. backward의 col2im은 겹친 위치의 기여를 더해야 하며 단순한 reshape 역변환이 아니다.

Max pooling은 영역의 최댓값을 남기며 학습 파라미터가 없다. `[[1,3],[2,4]]`의 결과는 4다. backward에서는 선택된 최댓값 위치로 gradient를 전달하고 겹치는 창의 기여는 합산한다. 동률일 때 어느 위치를 선택하는지는 구현 계약이다. 제한된 작은 이동에 둔감해질 수 있지만 일반적인 이동 불변성을 보장하지 않는다.

아래 독립 모형은 고정한 3×3 필터의 cross-correlation과 2×2 max pooling을 계산한다. 필터 학습은 포함하지 않는다.

```run-python
x = [[1,2,3,0],[0,1,2,3],[3,0,1,2],[2,3,0,1]]
w = [[1,0,-1],[1,0,-1],[1,0,-1]]
conv = [[sum(x[i+u][j+v]*w[u][v] for u in range(3) for v in range(3))
         for j in range(2)] for i in range(2)]
feature = [[1,3,2,4],[5,6,7,8],[3,2,1,0],[1,2,3,4]]
pool = [[max(feature[2*i+u][2*j+v] for u in range(2) for v in range(2))
         for j in range(2)] for i in range(2)]
print('cross_correlation', conv)
print('max_pool', pool)
```

Python 3.9.6에서 확인한 출력이다.

```text
cross_correlation [[-2, -2], [2, -2]]
max_pool [[6, 8], [3, 4]]
```

왼쪽 열 +1·오른쪽 열 -1 필터는 좌우 방향의 밝기 차이에 반응해 세로 경계를 검출하는 예다. ‘세로 방향으로 값이 변할 때 반응한다’와 구분한다.

### MNIST 크기로 연결한 설계 예

`(N,1,28,28) → Conv 32개(3×3,pad=1) → ReLU → MaxPool 2×2 → (N,32,14,14) → Conv 64개 → ReLU → MaxPool → (N,64,7,7) → Flatten(N,3136) → Affine(N,10)`으로 구성할 수 있다. 필터의 역할은 학습 결과로 생기며 사람이 모든 층에 눈·코 같은 의미를 미리 지정하지 않는다. 이 CNN은 구조 설명용이고, 현재 `lrn-mnist`가 실행하는 모델은 NumPy MLP다.
