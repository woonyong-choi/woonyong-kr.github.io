---
layout: default
title: 딥러닝
nav_order: 3
permalink: /wiki/deep-learning/
publication_state: publish
has_toc: true
projection_id: Wiki/ai-machine-learning/deep-learning
projection_sha256: 0c768fe30b491cf07c6675b5f0f38cc552916e78e7b75fdf5b4bef2eb131801a
parent: AI
content_status: ready
public_parent_id: Wiki/ai-machine-learning
---

# 딥러닝
{: .no_toc }

## 딥러닝의 학습은 예측과 갱신을 반복하는 과정이다

딥러닝은 여러 계산 층을 연결한 모델의 파라미터를 데이터와 목적함수로 학습한다. 한 입력을 출력으로 변환하는 순전파와, 손실에서 gradient를 구하는 [역전파](/wiki/ai-machine-learning-topic-f7bb4c8cd38e/), gradient로 실제 파라미터를 바꾸는 [optimizer](/wiki/ai-machine-learning-topic-63f78704eb10/)를 구분하면 전체 프로그램을 읽기 쉽다.

실행 경로는 데이터 준비·분할 → 배치 구성 → 순전파 → loss → backward → update → validation → checkpoint 선택으로 이어진다. 최종 test는 선택에 사용한 validation과 별도로 평가한다. 모델을 불러 추론만 하는 경로에는 backward와 optimizer가 필요하지 않다.

## 배치·에폭·update를 따로 센다

미니배치는 한 번의 계산에 넣는 샘플 묶음이고, 에폭은 유한한 학습 데이터 전체를 한 번 순회하는 단위다. 배치 처리 iteration과 optimizer update는 기본 학습 루프에서는 하나씩 대응하지만 gradient accumulation을 사용하면 달라진다. 로그의 step이 무엇을 세는지 먼저 확인한다.

60,000개를 배치 128로 나누고 마지막 잔여 배치를 유지하면 `ceil(60000/128)=469`배치이며 마지막은 96개다. 20에폭에서 배치마다 한 번 갱신하면 9,380 update다. `drop_last=True`로 잔여분을 버리면 한 에폭에 468배치다. 복원추출로 무작위 배치를 뽑는 루프는 같은 횟수를 돌아도 전체 샘플을 정확히 한 번씩 보았다고 할 수 없다.

현재 `lrn-mnist`는 60,000개 가운데 10,000개를 validation으로 분리해 50,000개를 학습에 사용한다. 기본 배치 128에서 391배치이고 마지막은 80개다. 따라서 60,000개 전체를 학습하던 과제 설정과는 에폭당 배치 수가 다르다. `lrn-gpt`의 현재 학습기는 무작위 token window를 step마다 뽑으므로 지정한 step 수를 자연스럽게 전체 코퍼스의 에폭 수로 바꾸지 않는다.

### 반복 단위가 다른 루프를 비교한다

전체 데이터를 한 번의 gradient 계산에 사용하는 full-batch, 샘플 하나를 사용하는 stochastic update, 그 사이 크기의 mini-batch는 한 갱신에 들어가는 표본 수가 다르다. 문헌이나 코드에서 SGD라는 이름으로 mini-batch 방식까지 함께 부르므로 실제 배치 크기를 확인해야 한다.

60,000장을 배치 256으로 나누고 나머지를 유지하면 한 에폭에 235배치, 20에폭에는 4,700번의 배치 처리가 있다. 배치 128의 9,380번과 에폭 수는 같지만 갱신 빈도는 다르다. 이 비교는 배치마다 한 번 update하는 루프에 해당한다.

여러 배치의 gradient를 모아 한 번 갱신하는 accumulation에서는 처리 횟수와 update 수를 따로 센다. 마지막에 덜 모인 gradient를 사용할지 버릴지도 결정해야 한다. 작은 마지막 배치가 섞였다면 각 배치 평균을 같은 비율로 더하는 방식이 전체 샘플 평균과 같지는 않다.

```run-python
def count_steps(samples, batch_size, epochs=1, accumulate=1, drop_last=False):
    assert samples > 0 and batch_size > 0 and epochs > 0 and accumulate > 0
    sizes = [min(batch_size, samples-start)
             for start in range(0, samples, batch_size)]
    if drop_last and sizes[-1] < batch_size:
        sizes.pop()
    # 에폭 마지막의 미완성 accumulation도 update하는 모형이다.
    updates = (len(sizes)+accumulate-1)//accumulate
    return len(sizes), sizes[-1] if sizes else 0, epochs*updates

for samples, batch in [(60000, 128), (60000, 256), (50000, 128)]:
    batches, last, updates = count_steps(samples, batch, epochs=20)
    print(samples, '개 / 배치', batch, '→', batches,
          '배치, 마지막', last, '개, 20에폭 update', updates)
print('60000/128 drop_last:', count_steps(60000, 128, drop_last=True))
print('60000/128 accumulation 4:', count_steps(60000, 128, accumulate=4))
assert count_steps(60000, 128, epochs=20) == (469, 96, 9380)
assert count_steps(50000, 128) == (391, 80, 391)
```

이 코드는 학습 횟수를 세는 모형이며 gradient를 계산하지 않는다. 실제 optimizer update를 몇 번 했는지는 학습 로그와 실행 경로에서 확인한다.

NumPy에서 permutation한 인덱스로 x와 y를 함께 자르는 작업은, PyTorch의 map-style Dataset과 DataLoader에서는 sampler·batch 구성·collation으로 나뉜다. DataLoader가 배치를 공급한다고 항상 전체 데이터를 정확히 한 번씩 읽는 것은 아니다. 사용한 sampler, 분산 학습의 표본 분배, `drop_last`와 IterableDataset의 반복 규칙에 따라 순회 범위가 달라진다. `global_step`의 증가 위치를 update 직후에 두었다면 그 값은 실제 갱신 수를 의미하고, 배치 처리 직후에 증가시키면 accumulation에서 다른 값이 된다.

## 배치 크기가 바꾸는 것은 메모리만이 아니다

입력 60,000×784와 중간 activation 60,000×512를 한 번에 처리하면 큰 메모리와 긴 update 간격이 필요하다. 미니배치는 계산을 나누고 더 자주 갱신한다. 표본이 적으면 gradient 잡음이 커질 수 있고, 큰 배치는 더 많은 activation 메모리를 쓰지만 장치를 효율적으로 사용할 여지도 있다. 같은 에폭에서 update 수가 달라지므로 단순히 큰 배치가 느리다거나 작은 배치가 항상 좋은 해를 찾는다고 결론 내리지 않는다.

에폭마다 인덱스를 permutation하고 같은 인덱스로 x와 y를 자르면 각 샘플을 한 번 사용하면서 순서를 바꿀 수 있다. 독립 이미지의 순서 편향을 줄이는 목적이다. 시간 순서가 의미인 데이터에서는 그 순서를 깨도 되는지 별도로 판단한다.

## 학습 loss의 평균에도 분모가 있다

배치 loss가 표본 평균일 때 전체 처리 표본의 평균은 `sum(batch_loss*batch_size)/sum(batch_size)`다. 마지막 작은 배치를 다른 배치와 동일 가중치로 평균하면 결과가 달라진다. 또 학습 중의 loss는 각 배치마다 다른 파라미터에서 계산된 값이므로 에폭 종료 모델을 전체 데이터에 평가한 loss와도 다르다.

예를 들어 128개 배치의 평균 loss 1.0과 32개 배치의 평균 loss 2.0을 단순 평균하면 1.5지만 표본 가중 평균은 `(128+64)/160=1.2`다. 현재 MNIST 학습 로그의 `train_loss`는 배치 loss의 단순 평균이며 checkpoint 선택에는 validation accuracy를 사용한다. 잔여 배치가 작을 때는 이 로그가 전체 처리 표본의 평균 loss와 다르다. GPT validation은 실제 평가한 token 수로 가중 평균하고 `evaluated_tokens`를 함께 반환한다.

## 데이터 로딩부터 저장까지 상태를 연결한다

MNIST는 28×28 픽셀을 784개로 펼치고 0~255 값을 255로 나눠 0~1로 맞춘다. 원래 배열의 dtype·픽셀 극성·빈 이미지·크기 차이는 추론 입력에서도 동일하게 다뤄야 한다. 직접 그린 숫자는 MNIST와 분포가 다를 수 있어 test 정확도만으로 그림 입력 품질을 보장하지 않는다.

NumPy의 `gradient(x_batch,y_batch)`는 확률·loss·층별 gradient를 계산하고 `optimizer.update(params,grads)`가 갱신한다. PyTorch는 `zero_grad → loss.backward → optimizer.step`으로 이를 나눈다. validation은 Dropout을 끄고 BatchNorm의 누적 통계를 사용하며 파라미터 갱신을 하지 않는다. `eval()`과 gradient 기록 비활성화는 다른 설정이므로 필요한 경우 둘 다 적용하고 학습 모드를 복원한다.

추론 모델에는 가중치·구조 설정·전처리·BatchNorm 통계가 필요하다. 정확한 학습 재개에는 optimizer·step·난수·데이터/분할 상태가 추가로 필요하다. 현재 MNIST 저장 파일은 추론 경로를 위한 모델이며 GPT checkpoint는 모델·optimizer·tokenizer·Python/NumPy/PyTorch 난수 상태·코퍼스 hash를 포함한다. 다른 코퍼스로 재개하는 경우 hash 검사가 거절한다. seed만 같다고 라이브러리·장치가 다른 실행까지 bitwise 동일한 것은 아니다.

현재 동작의 근거는 [MNIST 학습·저장 경로](https://github.com/woonyong-kr/lrn-mnist/blob/61b7000fc084fc5f8de52cc665eca69c31b23eb8/src/application.py)와 [GPT 학습·검증·재개 경로](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/runnable.py)다.
