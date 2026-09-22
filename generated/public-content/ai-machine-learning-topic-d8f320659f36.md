---
layout: default
title: 규제
nav_order: 10
permalink: /wiki/ai-machine-learning-topic-d8f320659f36/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/ai-machine-learning-topic-d8f320659f36
projection_sha256: 05cc8c389ef73f7f2b18e514e66143d23279d9d54fb8860129e064c6b45ef10d
parent: 머신러닝
content_status: ready
public_parent_id: Wiki/ai-machine-learning/ml
grand_parent: AI
---

# 규제
{: .no_toc }

## 규제는 훈련 데이터에만 맞는 해를 줄이려는 개입이다

규제(regularization)는 손실에 제약을 추가하거나 학습 중 계산·데이터·학습 기간에 변화를 주어 일반화를 돕는 방법이다. Dropout은 그중 활성화 일부를 무작위로 0으로 만드는 방식이다. 특정 경로 조합에만 의존하기 어렵게 만들지만, 어떤 모델에서도 과적합이 해결된다는 보장은 없다.

## 일반화 격차를 보고 개입할 위치를 정한다

훈련 오차가 작아도 새 데이터에서 오차가 크면, 학습한 규칙이 훈련 표본에 지나치게 맞춰졌는지 살핀다. 훈련과 검증에서 모두 원하는 수준에 못 미친다면 모델의 표현력·특징·학습 예산 부족도 후보가 된다. 두 곡선의 차이만으로 원인이 확정되지는 않으므로 데이터 분포와 평가 모드를 함께 확인한다. 곡선과 모델 용량을 진단하는 기준은 [과적합](/wiki/ai-machine-learning-topic-7284926f1556/)에서 더 살펴볼 수 있다.

784→100→50→10의 Affine 층에는 W와 b가 총 84,060개 있다. 이 수를 MNIST 훈련 이미지 60,000장과 비교하는 것만으로 이미지 전체를 외울 수 있다고 단정할 수는 없다. 파라미터 수와 샘플 수는 서로 다른 단위이고, 구조·데이터·학습 과정도 표현 능력과 일반화에 영향을 준다.

| 개입 위치 | 방법 | 확인할 조건 |
| --- | --- | --- |
| 파라미터 갱신 | L2 페널티·Weight Decay | optimizer와 감쇠 대상, 데이터 손실과의 균형 |
| 학습 중 활성화 | Dropout | 차단 확률·층 위치·학습과 추론의 스케일 |
| 학습 기간 | Early Stopping | 검증 지표·개선 기준·patience·복원할 checkpoint |
| 학습 데이터 | Data Augmentation | 변형 뒤에도 목표 레이블이 유지되는지 |

### 가중치 크기에 비용을 붙이는 경우

L2 페널티는 데이터 손실에 `lambda/2 * sum(W²)`를 더한다. 이때 W의 gradient에는 `lambda*W`가 추가된다. 기본 SGD에서는 곱셈 감쇠로 정리할 수 있지만, Adam처럼 gradient 이력을 변환하는 방법에서 같은 동작이라고 가정할 수는 없다. 감쇠를 분리하는 AdamW와의 차이는 [최적화 알고리즘](/wiki/ai-machine-learning-topic-63f78704eb10/)에서 다룬다.

학습용 MNIST 구현의 [SGD·Adam 클래스](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/optimizers.py)에는 `weight_decay` 인자가 없다. 아래 예제에서 비용과 gradient를 직접 계산하는 것과 이 optimizer가 감쇠를 적용하는 것은 구분해야 한다.

다음 계산은 가중치 행렬 두 개에 L2 비용을 추가한다. lambda는 원리를 보이기 위한 값이며 권장 설정이나 현재 MNIST 실행 결과가 아니다.

```run-python
weights = [[[1.0, -2.0], [0.5, 0.5]], [[0.2], [-0.1]]]
data_loss = 0.4
decay = 0.1
squared_sum = sum(v*v for matrix in weights for row in matrix for v in row)
penalty = 0.5*decay*squared_sum
print('가중치 제곱합:', round(squared_sum, 6))
print('L2 페널티:', round(penalty, 6))
print('전체 손실:', round(data_loss+penalty, 6))
print('첫 행렬의 추가 gradient:',
      [[round(decay*v, 6) for v in row] for row in weights[0]])
assert abs(penalty-0.2775) < 1e-12
```

lambda=0이면 이 추가 비용은 없다. 값을 크게 하면 작은 가중치를 선호하는 압력이 강해지지만, 규제를 늘릴수록 검증 성능도 좋아지는 것은 아니다. 여러 층과 정규화가 있는 모델의 입력 민감도를 가중치 하나의 크기만으로 판단하기도 어렵다. Bias나 정규화 층의 파라미터를 감쇠 대상에 포함할지는 명시적으로 정한다.

### 멈출 시점과 사용할 모델은 함께 정한다

검증 손실이 가장 낮았던 시점이 4번째 평가인데 학습은 7번째 평가까지 진행됐다면, 마지막 모델을 그대로 사용할지 4번째 상태로 돌아갈지 결정해야 한다. Early Stopping은 개선이 충분하지 않은 상태를 감시해 **언제 멈출지** 정하고, checkpoint는 **어느 상태로 돌아갈지** 보존한다. 중단했다고 최선의 모델이 자동으로 복원되지는 않는다.

감시할 지표와 방향부터 정한다. Validation loss는 작은 값, accuracy는 큰 값을 선호한다. Loss를 줄이는 직접 구현에서 `value < best - min_delta`를 개선으로 정의했다면, 그 조건을 만족할 때 best를 바꾸고 대기 카운터를 0으로 되돌린다. 만족하지 않으면 1을 더하며, 정한 횟수인 patience에 도달하면 멈춘다. `min_delta=0`에서는 같은 값도 개선이 아니다. 양수이면 작은 개선을 기다림 종료의 기준으로 인정하지 않을 수 있으므로, 단순히 관측한 최저점과 이 기준으로 채택한 best도 구분한다.

patience가 세는 것은 이 구현에서는 **평가 횟수**다. 매 에폭에 평가하면 에폭 수와 같지만, 여러 에폭마다 또는 일정 update마다 평가하면 다르다. 값이 작으면 일시적인 변동에 민감하고 크면 추가 계산을 오래 사용한다. 작은 데이터에는 5~10, LLM에는 2~3처럼 범위를 고정할 근거는 없으며 평가 빈도·잡음·계산 예산으로 정한다. Warmup 이후부터 감시하거나 학습률 변경 뒤의 반응을 기다리는 것도 명시적으로 선택할 조건이다. 예를 들어 Keras 3의 `EarlyStopping`은 `start_from_epoch`와 `restore_best_weights`를 별도 설정으로 제공하며, 복원 옵션의 기본값은 False다. [Keras EarlyStopping](https://keras.io/api/callbacks/early_stopping/)

아래 독립 모형에는 원리를 보기 위해 정해 둔 train/validation loss 일곱 쌍을 입력한다. 손실을 학습으로 얻는 프로그램이 아니라, 카운터와 저장된 상태가 어떻게 달라지는지 확인하는 프로그램이다. `epoch_marker`는 각 시점을 구분하는 표시이며 실제 가중치가 아니다.

```run-python
import json
import math


class Stopper:
    def __init__(self, patience=3, min_delta=0.0):
        if patience < 1 or min_delta < 0:
            raise ValueError('require patience >= 1 and min_delta >= 0')
        self.patience = patience
        self.min_delta = min_delta
        self.best = math.inf
        self.wait = 0

    def observe(self, value):
        if not math.isfinite(value):
            raise ValueError('validation metric must be finite')
        improved = value < self.best - self.min_delta
        if improved:
            self.best, self.wait = value, 0
        else:
            self.wait += 1
        return improved, self.wait >= self.patience


# Prescribed observations, not losses measured by training a model.
train_losses = [2.5, 1.8, 1.2, 0.8, 0.5, 0.3, 0.2]
val_losses = [2.4, 1.9, 1.7, 1.6, 1.7, 1.8, 1.9]
stopper = Stopper(patience=3, min_delta=0.0)
state = {'epoch_marker': [0]}
best_snapshot = None
print('epoch train validation wait action')
for epoch, (train_loss, val_loss) in enumerate(zip(train_losses, val_losses), 1):
    state['epoch_marker'][0] = epoch
    improved, stop = stopper.observe(val_loss)
    if improved:
        # Serialized in memory: later mutations cannot change the saved state.
        best_snapshot = json.dumps({'model': state, 'epoch': epoch,
                                    'score': val_loss})
    action = 'save' if improved else ('stop' if stop else 'wait')
    print(f'{epoch:5d} {train_loss:.1f} {val_loss:.1f} {stopper.wait:4d} {action}')
    if stop:
        break
if best_snapshot is None:
    raise RuntimeError('no valid checkpoint was selected')
restored = json.loads(best_snapshot)
print('stopped epoch:', epoch)
print('live marker:', state['epoch_marker'][0])
print('restored epoch:', restored['epoch'])
print('restored marker:', restored['model']['epoch_marker'][0])
assert epoch == 7 and stopper.wait == 3
assert restored['epoch'] == restored['model']['epoch_marker'][0] == 4
assert restored['score'] == 1.6
```

Python 3.9.6에서 실행한 결과다.

```text
epoch train validation wait action
    1 2.5 2.4    0 save
    2 1.8 1.9    0 save
    3 1.2 1.7    0 save
    4 0.8 1.6    0 save
    5 0.5 1.7    1 wait
    6 0.3 1.8    2 wait
    7 0.2 1.9    3 stop
stopped epoch: 7
live marker: 7
restored epoch: 4
restored marker: 4
```

4번째 평가에서 loss 1.6을 저장한 뒤 세 번 연속 개선이 없어 7번째에 멈춘다. 살아 있는 상태의 표시는 7이지만, 직렬화해 둔 최선 상태를 읽으면 4다. 이 예제는 JSON 문자열로 복사 시점을 고정한다. 메모리의 변경 가능한 객체를 참조만 해 두면 이후 갱신이 저장하려던 상태까지 바꿀 수 있다. PyTorch에서도 `model.state_dict()`를 최선 모델로 보관할 때는 즉시 직렬화하거나 깊은 복사로 상태를 고정한다. [PyTorch 모델 저장과 복원](https://docs.pytorch.org/tutorials/beginner/saving_loading_models.html)

추론에 사용할 모델을 복원하려면 W·b뿐 아니라 BatchNorm의 누적 통계처럼 추론에 영향을 주는 상태를 함께 읽는다. PyTorch의 `model.state_dict()`에는 등록된 buffer도 들어가며, 파일을 읽은 다음 `model.load_state_dict(...)`에 딕셔너리를 전달한다. 추론 모드 설정도 필요하다. 최선 모델을 선택한 뒤 평가할 test는 선택에 사용한 [검증 데이터](/wiki/ai-machine-learning-topic-3b9f4a2496bc/)와 분리한다.

학습을 이어가려면 모델에 더해 `optimizer.state_dict()`, 실제 `epoch`·`global_step`, scheduler와 난수·데이터 위치 등 다음 업데이트에 필요한 상태를 저장해야 한다. Early Stopping을 계속 적용한다면 best·대기 횟수·감시 설정도 이어 받아야 한다. best checkpoint는 모델 선택을, latest checkpoint는 중단 뒤 최근 진행 상황 복구를 위한 저장일 수 있다. 둘은 같은 파일일 필요가 없다. 저장 항목을 한 딕셔너리로 묶어 `torch.save`하고 `torch.load` 후 각 객체에 복원하는 구조와, 필요한 상태의 목록을 구분한다. epoch과 step을 파일에 적었다는 사실만으로 정확한 재개가 보장되지는 않는다. [PyTorch 일반 checkpoint](https://docs.pytorch.org/tutorials/beginner/saving_loading_models.html)

현재 `lrn-mnist`의 `application.py`는 validation accuracy가 좋아질 때 추론 모델을 저장하고 지정된 에폭 수까지 학습한다. patience로 중단하지 않으며 저장 파일에는 optimizer의 누적 상태가 없다. `lrn-gpt`의 `runnable.py`는 모델·optimizer·global_step·난수 상태 등을 저장하고 읽는 별도 경로를 제공한다. 위의 JSON 모형이 두 레포의 학습 재개나 성능을 검증한 것은 아니다. 실제 상태 경계는 [딥러닝 학습 경로](/wiki/deep-learning/)와 [최적화 알고리즘](/wiki/ai-machine-learning-topic-63f78704eb10/)에서 확인한다. [MNIST 저장·학습 코드 · 61b7000](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/application.py), [GPT 저장·복원 코드 · 027830d](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/runnable.py)

### 변형과 정답을 함께 확인한다

밝은 배경의 정면 고양이만 본 분류기에 어두운 방이나 다른 방향의 사진이 들어오면, 배경·방향에 의존한 예측은 실패할 수 있다. 학습 입력을 바꿔 여러 상황을 보게 하는 데이터 증강(data augmentation)은 이런 의존을 줄이려는 방법이다. 입력에서 증강하고, 활성화에서는 Dropout을, 파라미터 갱신에서는 L2·Weight Decay를 적용한다는 위치 차이가 있다.

같은 라벨을 유지하는 증강에서는 **변형 뒤에도 같은 답이 맞는지** 확인한다. 작은 이동이나 회전, 좌우 반전, 크롭, 밝기 변화도 과업에 따라 안전한 범위가 다르다. 숫자 6을 180도 돌려 9처럼 만들거나, 병변을 잘라내거나, 정답을 결정하는 색을 제거하면 입력의 의미가 달라질 수 있다. 원하는 변형에 덜 민감하도록 학습시키는 조건이지 완전한 불변성을 보장하는 것은 아니다.

음성의 약한 잡음 추가도 단어와 화자 등 무엇을 맞히는 과업인지에 따라 판단한다. 텍스트의 동의어 치환이나 문장 순서 변경은 의미를 유지하는 경우에만 후보가 된다. 부정 표현을 삭제하거나 사건 순서를 뒤집으면 답이 바뀔 수 있다. 라벨 변수에 같은 값을 넣어 두었다는 사실은 의미 보존의 증거가 아니다. 이미지 영역의 좌표나 분할 마스크가 정답인 과업에서는 입력의 기하 변형에 맞춰 정답도 변환해야 한다. 여기서는 한 이미지의 클래스 라벨을 유지하는 경우를 다룬다.

배열에서 일어나는 일과 라벨 판단을 먼저 분리해 보자. 아래 3×3 값은 좌우 반전·오른쪽 이동·밝기 변화를 추적하기 위한 숫자다. 고양이 영상이나 MNIST 샘플이 아니며, 세 변형은 각각 **원본**에 적용한다.

```run-python
original = ((1, 2, 3), (4, 5, 6), (7, 8, 9))


def flip(image):
    return tuple(tuple(reversed(row)) for row in image)


def shift_right(image):
    return tuple((0,) + row[:-1] for row in image)


def brighten(image):
    return tuple(tuple(min(9, max(0, value + 2)) for value in row) for row in image)


for name, image in (('original', original), ('flip', flip(original)),
                    ('shift_right', shift_right(original)),
                    ('brighten', brighten(original))):
    assert len(image) == 3 and all(len(row) == 3 for row in image)
    print(name, [list(row) for row in image])
sequential = brighten(shift_right(flip(original)))
print('flip -> shift -> brighten', [list(row) for row in sequential])
assert flip(flip(original)) == original
assert shift_right(original)[0] == (0, 1, 2)
assert brighten(original)[2] == (9, 9, 9)
assert sequential != brighten(original)
# Array shape and values do not establish a class label's semantic validity.
```

Python 3.9.6에서 실행한 결과다.

```text
original [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flip [[3, 2, 1], [6, 5, 4], [9, 8, 7]]
shift_right [[0, 1, 2], [0, 4, 5], [0, 7, 8]]
brighten [[3, 4, 5], [6, 7, 8], [9, 9, 9]]
flip -> shift -> brighten [[2, 5, 4], [2, 8, 7], [2, 9, 9]]
```

모든 결과의 shape은 3×3이지만, 오른쪽 이동은 원래 오른쪽 열을 버리고 밝기 클립은 9보다 큰 값을 9로 모은다. shape 보존이 정보 보존은 아니다. 마지막 줄처럼 세 변형을 이어 적용하면 원본에 각각 적용한 표와 다른 값이 된다. NumPy에서 같은 기본 연산은 `np.fliplr(img)`, `shift=np.zeros_like(img)`로 0을 채운 배열을 만든 뒤 `shift[:,1:]=img[:,:-1]`, `np.clip(img+2,0,9)`로 표현할 수 있다. 이 연산 결과만으로 클래스 라벨이 여전히 맞다고 판정하지는 않는다.

실제 이미지 파이프라인에서는 변형의 순서와 입력 형식을 함께 정한다. Torchvision 0.24의 기존 `transforms` API를 읽을 때, RGB PIL 이미지를 기준으로 다음 설정들의 역할을 구분할 수 있다. 이 표는 API의 구성 설명이며 이번 모형에서 Torchvision을 실행한 결과가 아니다.

| 흐름 | 훈련 쪽 구성 예 | 고정된 검증 쪽 구성 예 |
|---|---|---|
| 자르기·크기 | `RandomResizedCrop(224)`로 위치·면적·비율을 뽑아 자르고 224×224로 resize | `Resize(256)` 뒤 `CenterCrop(224)` |
| 방향·색상 | `RandomHorizontalFlip(p=0.5)`, `ColorJitter(brightness=0.2,contrast=0.2)` | 같은 무작위 변형을 적용하지 않음 |
| 텐서 변환 | `ToTensor()` | 같은 dtype·값 범위 계약의 `ToTensor()` |
| 채널별 스케일 | `Normalize(mean,std)` | 훈련과 같은 mean·std |

`RandomCrop`은 자를 위치를 고르는 연산이고 `RandomResizedCrop`은 자른 영역을 지정 크기로 다시 맞추므로 역할이 다르다. 여기서 224는 출력 크기이고 물체가 반드시 보존되는 크기라는 뜻은 아니다. 무작위 연산은 호출할 때마다 값을 뽑으므로 같은 이미지도 다르게 들어갈 수 있지만, 연속 호출마다 반드시 다른 영상이 나와야 하는 것은 아니다. [Torchvision 0.24 변환 규칙](https://docs.pytorch.org/vision/0.24/transforms.html), [RandomResizedCrop](https://docs.pytorch.org/vision/0.24/generated/torchvision.transforms.RandomResizedCrop.html)

RGB PIL 이미지에서 crop과 색상 변형을 한 뒤 `ToTensor()`를 사용하면 채널이 앞인 `(3,224,224)` 텐서를 얻고, 배치를 묶으면 `(N,3,224,224)`가 된다. NumPy uint8 입력을 변환하는 경우에도 HWC에서 CHW로 바뀌며 0~255 값이 0~1로 스케일된다. 다른 dtype에서는 같은 스케일링을 가정할 수 없다. 이미 Tensor인 입력이나 새로운 `transforms.v2`의 변환 API도 같은 호출 계약으로 뭉뚱그리지 않는다. [ToTensor의 입력·스케일 조건](https://docs.pytorch.org/vision/0.24/generated/torchvision.transforms.ToTensor.html)

`Normalize`는 지정한 채널별 `(x-mean)/std`를 계산하는 고정 전처리이며, 스스로 통계를 학습하거나 새 표본을 만드는 증강은 아니다. 예시로 자주 등장하는 `mean=[0.485,0.456,0.406]`, `std=[0.229,0.224,0.225]`도 모든 이미지 모델의 기본 정답이 아니다. 사용하는 모델과 데이터에 맞춰 정하고, 새로 추정하는 통계는 학습 데이터에서만 구한다. [Normalize의 계산](https://docs.pytorch.org/vision/0.24/generated/torchvision.transforms.Normalize.html)

무작위 증강은 보통 훈련 쪽에 두고, 모델을 고르는 검증에는 고정된 전처리를 사용해 비교 기준을 유지한다. 여러 변형의 예측을 합치는 평가를 따로 설계할 수는 있지만 그때도 변형 집합·집계 규칙과 평가 비용을 고정해야 한다. 원본별로 train/validation을 나눈 뒤 학습 쪽을 증강해야 같은 원본의 변형이 양쪽에 섞이는 누수를 피할 수 있다.

현재 `lrn-mnist/src/application.py`의 학습 루프에는 이런 무작위 증강 단계가 없다. 그림을 입력받는 추론 경로의 `preprocess_image`는 별도의 고정 전처리이므로 훈련 증강 기능으로 세지 않는다. 변형을 추가해 비교한다면 먼저 변환된 실제 입력과 라벨을 눈으로 확인하고, 그다음 같은 검증 분할에서 이득과 손실을 측정한다. [현재 MNIST 입력·학습 경로 · 61b7000](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/application.py)

Label Smoothing은 정답 분포를 부드럽게 만드는 다른 개입이다. K개 클래스의 one-hot q를 균등분포와 섞는 정의에서는 `q'=(1-eps)q+eps/K`가 된다. 확신을 낮추는 학습 압력을 주지만 확률 보정이나 정확도 개선은 따로 평가한다. Gradient Clipping은 gradient 크기를 제한하는 학습 안정화 방법으로, 같은 의미의 과적합 대책으로 묶지 않는다.

BatchNorm의 배치 통계와 Dropout의 마스크를 함께 사용하는 경우도 validation으로 상호작용을 살핀다. 모든 기법을 정해진 순서대로 추가하는 규칙보다, 바꿀 조건을 명시하고 같은 기준으로 비교하는 편이 원인을 해석하기 쉽다.

## Dropout으로 학습 경로를 바꾼다

표준 elementwise Dropout의 마스크는 배치 전체에 뉴런 하나를 공동으로 끄는 것이 아니라 입력의 각 원소에 적용한다. 채널 단위 Dropout 등은 별도 규칙이다. p는 정확히 p 비율의 원소를 골라 끄는 개수가 아니라 각 원소를 끌 확률이므로 작은 배열에서 실제 비율은 달라진다.

## 두 스케일링 관례를 섞지 않는다

keep 확률 q=1-p, 마스크 M∈{0,1}로 두면 두 관례가 있다.

| 방식 | 학습 출력 | 추론 출력 | 학습 backward |
|---|---|---|---|
| 기본 Dropout | X·M | qX | G·M |
| Inverted Dropout | X·M/q | X | G·M/q |

현재 `lrn-mnist`는 기본 방식을 사용하고 PyTorch `nn.Dropout`은 inverted 방식을 사용한다. inverted는 살아남은 값을 q로 나누는 것이며 `1/q`로 나누는 것이 아니다. p=0은 항등이고 위 나눗셈 식은 p<1에서 정의된다. p=1을 허용하는 구현은 전체 0 처리를 별도로 해야 한다.

학습 출력의 기대 크기를 맞추는 것은 각 층 입력을 고정했을 때의 설명이다. 비선형 층을 거친 전체 네트워크에서 추론 결과가 모든 마스크 결과의 정확한 평균과 같다는 뜻은 아니다. [PyTorch Dropout](https://docs.pytorch.org/docs/stable/generated/torch.nn.Dropout)

## forward의 마스크를 backward에서도 사용한다

NumPy 구현은 `mask = np.random.rand(*x.shape) > p`를 만들고 `x*mask`를 반환한다. backward에서 새 마스크를 뽑으면 forward에서 쓰지 않은 경로로 gradient가 흐르므로 같은 마스크를 재사용한다. 추론 분기는 qX를 반환하며 학습 forward의 마스크를 생성하지 않는다. 따라서 추론 뒤에 같은 학습 backward 계약을 무조건 호출할 수 없다.

마스크 연산 자체를 비교할 때는 아래처럼 값을 명시한 독립 모형을 사용한다. 난수 생성 결과와 분리해 스케일링을 확인할 수 있다.

```run-python
x = [[0.5,-0.3,0.8,1.2],[0.1,0.9,0.4,0.7]]
mask = [[False,True,True,True],[False,False,False,True]]
q = 0.5
train = [[v*int(m) for v,m in zip(row,marks)] for row,marks in zip(x,mask)]
infer = [[v*q for v in row] for row in x]
inverted = [[v/q for v in row] for row in train]
print('train', train)
print('infer', infer)
print('inverted_train', inverted)
```

Python 3.9.6에서 확인한 출력이다.

```text
train [[0.0, -0.3, 0.8, 1.2], [0.0, 0.0, 0.0, 0.7]]
infer [[0.25, -0.15, 0.4, 0.6], [0.05, 0.45, 0.2, 0.35]]
inverted_train [[0.0, -0.6, 1.6, 2.4], [0.0, 0.0, 0.0, 1.4]]
```

`Affine → BatchNorm → ReLU → Dropout`은 해당 MNIST 구현의 은닉층 구성이다. 모든 신경망이 같은 위치에 Dropout을 둬야 하는 규칙은 아니며, BatchNorm과 함께 쓰면 통계와 마스크의 상호작용도 validation에서 확인한다. 비율·위치·seed를 기록하고 [검증 데이터](/wiki/ai-machine-learning-topic-3b9f4a2496bc/)에서 학습·추론 모드를 맞춰 비교한다.

## 마스크로 고르는 것과 원래 자리에서 0으로 만드는 것

입력이 `(3, 4)`이고 같은 shape의 Boolean 마스크에서 True가 여섯 개라면 `x[mask]`는 선택된 여섯 값을 모은 `(6,)` 배열이다. `x * mask`는 `(3, 4)`의 위치를 유지하고 False 자리의 값만 0으로 만든다. Dropout에 필요한 것은 후자의 shape 보존이다. 순전파에 쓴 마스크를 역전파에서도 재사용해야 차단한 위치로 gradient가 흐르지 않는다.

HyeYeon의 Dropout 트러블슈팅 기록에는 `(4,)`와 `(3, 4)`의 assertion 오류가 등장한다. 제시된 동일 shape 마스크 예제만으로 당시 `(4,)`가 나온 전체 경로를 확정할 수는 없다. 행 단위 마스크 `[True, False, False]`의 결과는 `(1, 4)`이며 `x[0]`의 `(4,)`와도 다르다. 오류를 재현하려면 마스크의 shape뿐 아니라 그 전에 어떤 인덱싱을 거쳤는지도 추적해야 한다. shape를 올바르게 유지한 뒤에는 선택한 기본·inverted 방식에 맞춰 train/inference 스케일링을 적용한다. [Dropout mask 트러블슈팅: `x[self.mask]`와 `x * self.mask`의 차이 · 1c28de6](https://github.com/woonyong-kr/lrn-mnist/blob/1c28de6983671e891faac453e392f68b354bdb53/src/study/HyeYeon/md/%EB%93%9C%EB%A1%AD%EC%95%84%EC%9B%83_%EB%A7%88%EC%8A%A4%ED%81%AC_%EC%9D%B8%EB%8D%B1%EC%8B%B1_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85.md)
