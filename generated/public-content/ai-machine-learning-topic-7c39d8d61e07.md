---
layout: default
title: 손실 함수
nav_order: 4
permalink: /wiki/ai-machine-learning-topic-7c39d8d61e07/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/ai-machine-learning-topic-7c39d8d61e07
projection_sha256: 1d6cd7d035b15ef6f60ce54862fbd6029215c1a4a42a8459bc07f9181230d11a
parent: 딥러닝
content_status: ready
public_parent_id: Wiki/ai-machine-learning/deep-learning
grand_parent: AI
---

# 손실 함수
{: .no_toc }

## 예측과 정답을 어떤 값으로 비교하는가

100개 중 70개를 맞히는 분류기가 정답 클래스의 확률을 조금씩 높여도, 최종 예측 라벨이 바뀌기 전까지 정확도는 70%에 머문다. 정확도는 라벨이 유지되는 구간에서 가중치를 바꿔도 일정하고, 결정 경계에서는 불연속적으로 바뀐다. 경사 하강법에는 이런 작은 변화를 구분할 학습 신호가 필요하다.

손실 함수는 학습에서 줄일 오차를 수치로 정의한다. 회귀에서는 예측한 실숫값과 정답의 차이를, 분류에서는 정답에 부여한 확률 등을 비교한다. 모든 손실이 확률을 입력받거나 모든 지점에서 미분 가능한 것은 아니다. [회귀의 MSE·MAE·Huber](/wiki/ai-machine-learning-topic-93581f9e6303/)처럼 학습 목적에 맞는 오차와 평균 방식을 먼저 정하고, 미분 또는 필요한 지점의 subgradient를 이용한다.

분류에서는 모델의 마지막 선형층이 클래스별 실수 점수인 logits z를 출력하고, softmax로 확률 p를 만든다. 정답 분포 q에 대한 Cross Entropy는 `H(q,p) = -Σ q_i log p_i`다. 대칭성이나 삼각부등식을 만족하는 거리 함수는 아니다. 배치 B개의 categorical loss는 클래스 C개를 먼저 더한 뒤 샘플을 평균해 `L = -(1/B) Σ_b Σ_c q_bc log p_bc`로 계산한다.

정답이 클래스 k 하나인 one-hot이면 손실은 `-log p_k`가 된다. 정답 확률 1·0.5·0.01에 대한 손실은 각각 0·약 0.693·약 4.605 nats다. 자연로그를 사용한 categorical negative log likelihood를 표본에 걸쳐 최소화하는 것은 해당 데이터의 우도를 최대화하는 것과 같다. q가 고정일 때 `H(q,p)=H(q)+KL(q||p)`라는 관계도 있다.

MSE도 확률 예측에 사용할 수 있다. 다만 softmax와 결합한 MSE의 logit gradient에는 softmax Jacobian이 남는다. 손실 이름만으로 학습 속도가 항상 빠르거나 느리다고 단정하지 않고, 입력이 확률인지 logit인지와 미분 대상을 함께 비교한다.

## 확률에 대한 미분과 logit에 대한 미분

샘플 하나에서 정답 확률에 대한 미분은 `∂L/∂p_k = -1/p_k`다. softmax를 합성해 logit에 대해 미분하면 `∂L/∂z_i = p_i - 1{i=k}`로 바뀐다. 전자는 p_k가 작아지면 크기가 커지지만 후자는 각 성분이 -1과 1 사이에 있다. 낮은 정답 확률이 ‘무한히 큰 logit gradient’를 만든다고 설명하지 않는다.

배치 N개의 무가중 평균 손실이면 logit gradient는 `(p-one_hot)/N`이다. 예측 확률을 복사한 뒤 각 행의 정답 열에서 1을 빼는 구현은 one-hot 배열을 직접 만들지 않고 같은 값을 얻는다.

아래는 분류기 학습 전체를 대신하지 않는 독립 계산 모형이다. 확률 세 행에 대해 loss와 logit gradient를 계산한다.

```run-python
from math import log

p = [[0.1, 0.2, 0.7], [0.8, 0.1, 0.1], [0.2, 0.6, 0.2]]
target = [2, 0, 1]
n = len(p)
loss = -sum(log(row[t]) for row, t in zip(p, target)) / n
gradient = [[(value - int(j == t)) / n for j, value in enumerate(row)]
            for row, t in zip(p, target)]
print(f"loss={loss:.6f}")
for row in gradient:
    print([round(value, 6) for value in row])
```

Python 3.9.6에서 확인한 출력이다.

```text
loss=0.363548
[0.033333, 0.066667, -0.1]
[-0.066667, 0.033333, 0.033333]
[0.066667, -0.133333, 0.066667]
```

`lrn-mnist`의 `NeuralNetwork.gradient`는 forward에서 만든 softmax 확률로 `cross_entropy_loss`를 계산하고, `cross_entropy_gradient`의 결합 gradient를 backward에 전달한다. 이 경로의 `Softmax.backward`는 받은 값을 통과시킨다. 일반적인 softmax의 미분이 항등이라는 뜻이 아니라 이미 softmax 미분까지 합친 특정 네트워크 계약이다. [MNIST 손실 구현](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/losses.py) · [네트워크 연결](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/network.py)

## 같은 logits에서 두 손실의 기울기를 비교하기

정답이 0번 클래스인데 모델이 `p=[0.01, 0.98, 0.01]`을 예측했다고 하자. 이 샘플의 원소 평균 MSE는 `L_MSE = Σ_c(p_c-q_c)²/C`이고 확률에 대한 미분은 `g_c = ∂L_MSE/∂p_c = 2(p_c-q_c)/C`다. 이 값과 Cross-Entropy의 `p-q`를 바로 비교하면 미분하는 변수가 서로 다르다.

같은 logit z에 대한 비교를 하려면 softmax의 미분을 거쳐야 한다. `∂p_i/∂z_j = p_i(1{i=j}-p_j)`를 대입하면 `∂L_MSE/∂z_j = p_j(g_j-Σ_i p_i g_i)`가 된다. 반면 단일 샘플 Cross-Entropy의 logit gradient는 `p-q`다. 각 클래스 항을 합칠지 평균낼지도 밝혀야 하며, MSE를 클래스 합으로 정의하면 아래 MSE gradient는 C배가 된다.

아래 독립 모형은 같은 z에서 두 gradient를 수치 미분과 대조한다. 앞부분의 세 샘플은 정답 확률 0.7·0.8·0.4를 각각 선택하는 예다. 마지막은 이 샘플을 크기 2와 1의 배치로 나눴을 때 평균이 어떻게 달라지는지 보여 준다. 실제 신경망을 학습하거나 NumPy·PyTorch 구현을 실행하는 코드는 아니다.

```run-python
from math import exp, log


def softmax(z):
    shifted = [exp(value - max(z)) for value in z]
    return [value / sum(shifted) for value in shifted]


def numerical_gradient(function, values, h=1e-5):
    result = []
    for i in range(len(values)):
        plus, minus = values.copy(), values.copy()
        plus[i] += h
        minus[i] -= h
        result.append((function(plus) - function(minus)) / (2 * h))
    return result


# Three classification examples from the source: select the target probability.
rows = [[0.7, 0.2, 0.1], [0.1, 0.8, 0.1], [0.3, 0.3, 0.4]]
target = [0, 1, 2]
losses = [-log(row[t]) for row, t in zip(rows, target)]
print("sample_loss:", [round(value, 6) for value in losses])
print(f"batch_mean={sum(losses) / len(losses):.6f}")

# Both gradients below are with respect to the SAME logits z.
p = [0.01, 0.98, 0.01]
t = [1, 0, 0]
z = [log(value) for value in p]
g_p = [2 * (value - truth) / len(p) for value, truth in zip(p, t)]
weighted = sum(value * grad for value, grad in zip(p, g_p))
mse_z = [value * (grad - weighted) for value, grad in zip(p, g_p)]
ce_z = [value - truth for value, truth in zip(p, t)]
mse = lambda values: sum((a - b) ** 2 for a, b in zip(softmax(values), t)) / len(t)
ce = lambda values: -log(softmax(values)[0])
assert max(abs(a - b) for a, b in zip(mse_z, numerical_gradient(mse, z))) < 1e-8
assert max(abs(a - b) for a, b in zip(ce_z, numerical_gradient(ce, z))) < 1e-8
print("MSE dL/dp:", [round(value, 6) for value in g_p])
print("MSE dL/dz:", [round(value, 6) for value in mse_z])
print("CE  dL/dz:", [round(value, 6) for value in ce_z])
print("both logit gradients: central difference < 1e-8")

# The same three samples grouped as batches of two and one.
batch_means = [sum(losses[:2]) / 2, losses[2]]
print(f"mean_of_batch_means={sum(batch_means) / 2:.6f}")
print(f"sample_weighted_mean={(batch_means[0] * 2 + batch_means[1]) / 3:.6f}")
```

Python 3.9.6에서 1회 확인한 출력이다.

```text
sample_loss: [0.356675, 0.223144, 0.916291]
batch_mean=0.498703
MSE dL/dp: [-0.66, 0.653333, 0.006667]
MSE dL/dz: [-0.012937, 0.019208, -0.006271]
CE  dL/dz: [-0.99, 0.98, 0.01]
both logit gradients: central difference < 1e-8
mean_of_batch_means=0.603100
sample_weighted_mean=0.498703
```

세 번째 샘플의 손실 0.916291은 나머지 둘보다 크다. 그러나 손실 순서만으로 전체 파라미터 gradient의 크기나 다음 갱신 후 어떤 샘플이 가장 개선될지 결정할 수는 없다. 출력층 gradient가 앞선 층의 Jacobian과 합성되고, 배치 안의 기여가 더해지기 때문이다. 그 전파 과정은 [역전파](/wiki/ai-machine-learning-topic-f7bb4c8cd38e/)에서 이어진다.

크게 틀린 이 예에서 MSE의 logit gradient는 softmax를 통과하며 작아지고, Cross-Entropy는 정답 방향에 약 -0.99를 전달한다. 이것은 특정 출력에서의 미분 비교다. 일반적인 학습 속도·최종 정확도·수렴 안정성을 측정한 결과는 아니다.

## 안정적인 계산과 평균의 분모

확률을 만든 뒤 0에 가까운 값을 clip하면 log(0)을 피할 수 있지만 clipped loss의 경계 밖 미분은 원래 수식과 다르다. `lrn-mnist/src/losses.py`의 `cross_entropy_loss`는 `(B,C)` 확률과 `(B,)` 정수 레이블의 기본 경로에서 `clipped[np.arange(B), target]`로 각 행의 정답 열을 선택한다. 예를 들어 레이블이 `[2,0,7]`이면 0행 2열·1행 0열·2행 7열을 고른다. one-hot 입력은 argmax로 정수 레이블로 바꾸므로 임의의 soft target 분포를 지원한다는 뜻은 아니다. clipping 하한은 `1e-7`이다. 이는 로그의 수치 방어이며, 원래 Cross-Entropy와 결합한 gradient가 clipping 영역까지 그 함수의 정확한 미분이라는 보장은 아니다.

극단적인 logits에서는 `logsumexp(z)-z_k`를 직접 계산하는 방식이 더 적합하다. 유한 logits에서 최댓값 m을 빼 `m+log Σ exp(z_i-m)-z_k`로 계산하면 지수 overflow를 피한다.

PyTorch `F.cross_entropy`는 logits를 받으며 class index target에서는 LogSoftmax와 NLLLoss를 결합한 계산에 해당한다. softmax 확률을 먼저 넣으면 확률을 다시 logits로 해석해 다른 손실이 된다. 무가중 class-index 평균에서는 제외하지 않은 위치 수를 분모로 쓴다. class weight를 적용하면 유효 위치의 정답 클래스 weight 합이 분모가 되며, soft target 평균과도 구별해야 한다. [CrossEntropyLoss 2.14 문서](https://docs.pytorch.org/docs/2.14/generated/torch.nn.CrossEntropyLoss.html)

전체 데이터를 매번 평가하지 않고 무작위 미니배치의 평균을 학습에 쓸 수 있다. 32~256개는 가능한 배치 크기의 예일 뿐 정해진 범위가 아니다. 균등 표본 추출은 전체 평균 gradient를 추정하는 방법이고, `sum` 대신 `mean`을 쓰면 같은 샘플을 복제했을 때 배치 크기만큼 gradient가 커지는 효과를 제거한다. 배치 구성·분산·최적화 경로까지 같아지는 것은 아니다.

언어 모델의 logits `(B,T,V)`는 `(B*T,V)`, target `(B,T)`는 `(B*T,)`로 펼칠 수 있다. `lrn-gpt/src/model.py`는 이 형태를 `F.cross_entropy`에 전달한다. 현재 실행 경로의 target은 고정 길이 다음 토큰 창이며 padding·prompt mask를 만들지 않는다. `TrainingRun.validate`는 각 배치 loss에 `y.numel()`을 곱해 누적하고 실제 평가한 토큰 수로 나눈다. 나중에 위치를 제외한다면 분자·분모 모두 그 계약으로 바꿔야 한다. [GPT 모델](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/model.py) · [평가 누적](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/runnable.py)

배치별 평균의 단순 평균과 표본 전체의 평균은 마지막 배치 크기가 다를 때 달라진다. 위 모형에서는 각각 0.603100과 0.498703이다. `lrn-mnist/src/application.py`가 출력하는 `train_loss`는 배치별 loss의 단순 평균이다. 배치 크기가 다르면 표본 가중 평균과 같지 않고, 각 배치가 서로 다른 업데이트 시점에 계산되므로 마지막 모델의 전체 훈련 데이터 평가 손실도 아니다. 이 로그와 고정 모델의 validation loss를 같은 측정이라고 해석하지 않는다. [MNIST 학습 로그 계산](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/application.py)

## Perplexity를 비교할 수 있는 조건

자연로그로 계산한 평균 token loss L의 perplexity는 `exp(L)`다. 예를 들어 PPL=100은 정답 토큰에 부여한 확률의 기하평균이 1/100이라는 뜻이며, 매 위치에서 정확히 100개 후보가 균등하다는 뜻은 아니다. [토크나이저](/wiki/ai-machine-learning-topic-b126bbe83b86/)·코퍼스·문맥·scoring 위치가 다르면 같은 단위의 비교가 아니다. 특정 GPT 버전의 PPL도 평가 코퍼스와 tokenizer·문맥·scoring 조건을 함께 알아야 해석할 수 있다.

정수 레이블로 정답 열을 선택하는 `dout[np.arange(N), target] -= 1`은 one-hot 배열 없이 정답 위치의 gradient를 계산하는 코드다. HyeYeon의 손실 함수·dout 노트는 이를 손실별 미분 경로와 연결한다. 위 독립 예제는 그 노트의 확률 행렬을 사용한다. [04. 학습, 손실함수, 수치미분 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/docs/woonyong/deep-learning-from-scratch/04-learning-loss-gradient.md) [1. 손실 함수란 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/src/study/HyeYeon/md/%EA%B5%90%EC%B0%A8%EC%97%94%ED%8A%B8%EB%A1%9C%ED%94%BC%EC%98%A4%EC%B0%A8%EC%99%80_%EC%98%A4%EC%B0%A8%EC%A0%9C%EA%B3%B1%ED%95%A9_%EB%B9%84%EA%B5%90.md) [Softmax + CrossEntropy의 dout 만들기 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/src/study/HyeYeon/md/%EC%86%8C%ED%94%84%ED%8A%B8%EB%A7%A5%EC%8A%A4_%EA%B5%90%EC%B0%A8%EC%97%94%ED%8A%B8%EB%A1%9C%ED%94%BC_dout_%EC%98%88%EC%8B%9C.md)

## 대조 학습에서는 샘플 사이의 어떤 관계를 비교하는가

새로 들어온 얼굴이 등록된 얼굴과 같은 사람인지, 두 문장이 비슷한 뜻인지를 비교하려면 각 입력을 벡터로 표현하고 관계를 학습할 수 있다. 각 샘플의 정답 벡터를 미리 정하는 대신 “서로 대응하는 쌍인가”를 학습 신호로 삼는다. 이 표현을 비교 가능하게 만드는 목표와 [Embedding의 벡터 폭·저장 비용](/wiki/ai-machine-learning-topic-7c4a8b2afe4c/)은 별개의 설계 결정이다.

Cross-Entropy가 언제나 사람이 붙인 절대 클래스 레이블을 요구하는 것은 아니다. 대응하는 쌍의 위치를 정답 인덱스로 구성할 수도 있다. 얼굴의 고정 클래스 분류도 가능한 학습법이지만, 아래에서는 새로운 샘플에도 적용할 거리·유사도 표현을 배우는 두 목표를 비교한다. positive 관계는 같은 대상 레이블, 의미가 대응하는 입력, 적절한 증강처럼 과업에 맞는 근거로 정해야 한다.

### 거리 기반 margin 손실

두 embedding을 `z1,z2`, 유클리드 거리를 `d=||z1-z2||_2`라 하자. 여기서는 y=1이 positive, y=0이 negative다. 일부 논문·구현은 반대 부호를 쓰므로 쌍 레이블의 계약을 먼저 맞춘다. 이 절의 평균 전 쌍별 손실은 `L=0.5*[y*d²+(1-y)*max(m-d,0)²]`, margin은 `m>0`이다. Hadsell 등의 원 논문은 Y=0을 similar로 쓰며, `y=1-Y`로 바꾸면 같은 식이 된다. [DrLIM 논문, 식 (4)](https://www.cs.toronto.edu/~hinton/csc2535/readings/hadsell-chopra-lecun-06-1.pdf)

| 쌍 | 손실 | z1에 대한 쌍별 gradient | gradient를 빼서 갱신하면 |
| --- | --- | --- | --- |
| positive | `d²/2` | `z1-z2` | z2 쪽으로 이동 |
| negative, `0<d<m` | `(m-d)²/2` | `(d-m)*(z1-z2)/d` | z2에서 멀어짐 |
| negative, `d≥m` | 0 | 0 | 그 쌍의 직접 기여 없음 |

배치 N쌍을 평균하면 각 gradient도 N으로 나눈다. “같은 쌍을 당긴다”는 것은 gradient 자체의 방향이 아니라 gradient를 빼는 업데이트의 방향이다. negative가 이미 margin을 넘으면 이 항은 더 벌리도록 요구하지 않는다. 다만 동일 embedding이 다른 쌍에도 쓰이거나 optimizer 상태·정규화가 작동하면 그 값은 여전히 변할 수 있다. margin이 없는 모든 대조 손실이 무조건 벡터를 무한히 멀리 보낸다고 일반화할 수는 없다.

세 쌍 `[[1,0],[0,1],[1,1]]`과 `[[.9,.1],[1,0],[.8,.9]]`, 레이블 `[1,0,1]`, m=1을 대입하면 거리는 약 `[.1414,1.4142,.2236]`이다. 쌍별 손실은 `[.010,0,.025]`이고 평균은 약 .011667이다. 두 번째 쌍만 negative이며 이미 margin을 넘었으므로 손실이 0이다. 두 positive는 거리가 남아 있어 기여한다.

### NumPy와 PyTorch에서 같은 수식을 확인할 조건

NumPy로 구현한다면 `(z1-z2)**2`를 feature 축으로 합하고 제곱근을 취해 `(N,)` 거리를 만든다. y로 positive 항을 선택하고 `maximum(m-d,0)**2`를 negative 항으로 골라 평균한다. 입력 `(N,D)`와 레이블 `(N,)`의 shape, 0/1 규약, margin과 reduction이 서로 맞아야 한다.

NumPy에서 거리를 `sqrt(sum(diff²)+1e-12)`로 계산하는 경우와 달리, PyTorch `F.pairwise_distance`의 기본 epsilon 방식은 `||diff+eps*1||_p`다. `eps=1e-6`이 각 좌표에 더해지므로 같은 거리 구현이라고 단정하면 안 된다. 반올림한 값 .0117이 비슷하다는 것만으로 수치·미분 동등성을 증명하지 못한다. 정확한 수식 비교에는 epsilon 처리도 같게 정의해야 한다. [PairwiseDistance 2.14](https://docs.pytorch.org/docs/2.14/generated/torch.nn.PairwiseDistance.html)

특히 negative 쌍이 정확히 겹친 d=0에서는 위 거리 기반 식의 z1 미분 방향이 하나로 정해지지 않는다. epsilon을 넣거나 별도의 gradient 규칙을 고르면 목적함수 또는 그 경계 처리가 달라질 수 있다. 아래 모형은 epsilon 없는 식을 쓰며, 미분 대조는 겹치지 않는 쌍에서만 한다.

`nn.Module` 상속 자체가 자동 미분을 켜는 것은 아니다. gradient 추적이 켜진 상태에서 `requires_grad=True`인 텐서와 미분 가능한 연산을 사용해야 한다. `loss.backward()`는 경로에 연결된 gradient 대상 leaf의 `.grad`에 누적한다. 예를 들어 `tz1`만 `requires_grad=True`인 leaf로 만들고 `tz2`는 `requires_grad=False`로 두었다면, 두 입력 중 `.grad`가 채워지는 대상은 `tz1`이다. `.grad`가 생기는 대상과 encoder 파라미터까지의 연결을 구분한다. [Autograd 2.14의 requires_grad 계약](https://docs.pytorch.org/docs/2.14/notes/autograd.html#setting-requires-grad)

### 유사도 기반 InfoNCE

InfoNCE는 하나의 positive를 여러 후보 중에서 맞히는 categorical loss로 구성할 수 있다. 일반적인 점수 함수가 반드시 cosine이어야 하는 것은 아니다. 다음은 0이 아닌 q·k를 길이 1로 정규화한 뒤 cosine similarity를 쓰는 한 방향 구현이다. [Contrastive Predictive Coding, §2.3](https://arxiv.org/abs/1807.03748)

대응하는 q·k가 각각 `(N,D)`이고 행 i끼리 positive라면 `s_ij=normalize(q_i)·normalize(k_j)/tau`, `tau>0`로 `(N,N)` logits를 만든다. 행 i의 정답은 i이며 `L_i=-s_ii+log Σ_j exp(s_ij)`다. 각 행에 positive 하나와 다른 N-1개 후보가 들어가고 마지막에 N행을 평균한다. q `(4,8)`와 k의 전치 `(8,4)`를 곱하면 `(4,4)`가 되며 정답은 `[0,1,2,3]`이다.

이 loss는 앞에서 다룬 Cross-Entropy의 logits 입력 계약을 그대로 쓴다. 평균 loss의 logit gradient는 `(softmax(s_ij)-1{i=j})/N`이며, 원래 cosine score에 대한 미분에는 추가로 `1/tau`가 붙는다. q·k까지 미분하려면 정규화와 내적의 미분도 거쳐야 한다. tau를 줄이면 후보 확률이 더 집중되지만 이것이 표현 품질의 개선을 보장하지는 않는다. N=1이면 이 구성은 고를 다른 후보가 없어 loss가 0이 된다.

다른 행의 k가 실제로도 관련 있는 입력이면 negative로 취급하는 것이 잘못된 학습 신호가 될 수 있다. 쌍 구성·중복·후보 선택을 확인해야 한다. 모든 q-k 쌍을 비교하는 행렬의 원소 수는 N²이며, 후보를 늘리는 데도 비용이 든다.

SimCLR는 2N개 증강 view에서 자기 자신을 후보에서 제외하고, 대응 view를 positive로 삼는 양방향 NT-Xent를 사용한다. CLIP은 정규화한 이미지·텍스트 특징의 N×N 점수에서 두 방향의 Cross-Entropy를 평균하고, 학습 가능한 점수 스케일을 사용한다. 아래 한 방향 N×N 모형을 두 모델의 전체 학습 구현으로 소개하지 않는다. [SimCLR Algorithm 1](https://proceedings.mlr.press/v119/chen20j/chen20j.pdf) · [CLIP Figure 3](https://proceedings.mlr.press/v139/radford21a/radford21a.pdf)

### 두 대조 방식의 작은 계산

아래는 쌍별 margin 손실과 0이 아닌 8차원 벡터 네 쌍의 cosine InfoNCE를 계산하는 독립 모형이다. 앞의 세 쌍을 계산하고, positive·활성 negative·margin 밖 negative의 gradient를 중심 차분과 비교한다. NumPy·PyTorch 예제를 재실행하거나 표현 모델을 훈련하는 코드는 아니다.

```run-python
from math import exp, log, sqrt


def pair_loss(a, b, same, margin=1.0):
    if margin <= 0 or same not in (0, 1) or not a or len(a) != len(b):
        raise ValueError("positive margin, binary pair label, equal nonempty vectors required")
    distance = sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))
    loss = 0.5 * (distance ** 2 if same else max(margin - distance, 0) ** 2)
    return loss, distance


def pair_gradient(a, b, same, margin=1.0):
    _, d = pair_loss(a, b, same, margin)
    if same:
        return [x - y for x, y in zip(a, b)]
    if d >= margin:
        return [0.0] * len(a)
    if d == 0:
        raise ValueError("negative coincident pair has no unique gradient")
    return [(d - margin) * (x - y) / d for x, y in zip(a, b)]


z1 = [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]
z2 = [[0.9, 0.1], [1.0, 0.0], [0.8, 0.9]]
labels = [1, 0, 1]
pairs = [pair_loss(a, b, y) for a, b, y in zip(z1, z2, labels)]
print("distances:", [round(d, 6) for _, d in pairs])
print("pair_losses:", [round(value, 6) for value, _ in pairs])
print(f"pair_mean={sum(value for value, _ in pairs) / len(pairs):.6f}")

# Check attraction, an active negative pair, and a negative beyond the margin.
for a, b, same in (([1.0, 0.0], [0.9, 0.1], 1),
                   ([0.0, 0.0], [0.5, 0.0], 0),
                   ([0.0, 0.0], [1.5, 0.0], 0)):
    gradient = pair_gradient(a, b, same)
    h = 1e-5
    for i, expected in enumerate(gradient):
        plus, minus = a.copy(), a.copy()
        plus[i] += h
        minus[i] -= h
        numerical = (pair_loss(plus, b, same)[0] - pair_loss(minus, b, same)[0]) / (2 * h)
        assert abs(numerical - expected) < 1e-8
print("pair gradients: central difference < 1e-8 (three noncoincident cases)")


def normalize(row):
    norm = sqrt(sum(value * value for value in row))
    if norm == 0:
        raise ValueError("cosine model requires nonzero vectors")
    return [value / norm for value in row]


def info_nce(q, k, tau):
    if tau <= 0 or len(q) != len(k) or len(q) < 2:
        raise ValueError("positive temperature and at least two paired rows required")
    q, k = list(map(normalize, q)), list(map(normalize, k))
    logits = [[sum(a * b for a, b in zip(x, y)) / tau for y in k] for x in q]
    losses = []
    for i, row in enumerate(logits):
        largest = max(row)
        losses.append(largest + log(sum(exp(x - largest) for x in row)) - row[i])
    return sum(losses) / len(losses), logits


q = [[float(i == j) for j in range(8)] for i in range(4)]
k = [row.copy() for row in q]
for tau in (0.5, 0.1):
    loss, logits = info_nce(q, k, tau)
    assert abs(loss - log(1 + 3 * exp(-1 / tau))) < 1e-12
    print(f"q(4,8), k(4,8), logits(4,4), target=[0,1,2,3], tau={tau}: loss={loss:.6f}")
```

Python 3.9.6에서 확인한 출력이다.

```text
distances: [0.141421, 1.414214, 0.223607]
pair_losses: [0.01, 0.0, 0.025]
pair_mean=0.011667
pair gradients: central difference < 1e-8 (three noncoincident cases)
q(4,8), k(4,8), logits(4,4), target=[0,1,2,3], tau=0.5: loss=0.340753
q(4,8), k(4,8), logits(4,4), target=[0,1,2,3], tau=0.1: loss=0.000136
```

첫 결과는 margin 밖의 negative가 손실에 기여하지 않음을 보여 준다. 마지막 두 값은 이미 서로 직교하고 자기 짝과 같은 벡터에 temperature만 바꿔 적용한 결과다. 학습으로 embedding이 좋아진 결과가 아니다. 현재 `lrn-mnist`의 숫자 분류와 `lrn-gpt`의 다음 토큰 예측 경로에 이 대조 손실을 새로 구현한 것도 아니다.
