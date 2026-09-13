---
layout: default
title: Transformer
nav_order: 5
permalink: /wiki/ai-machine-learning-transformer-924ea08dd69a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/ai-machine-learning-transformer-924ea08dd69a
projection_sha256: fc2b3b5610eb8e0b4d597dee5ccfe63e23e8757f2eb692b3650e2c879b50e2c1
parent: LLM
content_status: ready
public_parent_id: Wiki/ai-machine-learning/llm
grand_parent: AI
---

# Transformer
{: .no_toc }

## 블록의 계산과 학습 목적을 함께 본다

Transformer는 [Attention](/wiki/ai-machine-learning-attention-820ced4d5b89/)과 토큰별 feed-forward 계산에 residual·normalization을 결합한 구조다. GPT 계열의 작은 decoder LM과 BERT 계열 encoder는 이 부품을 사용하지만 참조 범위·학습 목적·입력/출력 구성까지 같지는 않다. mask 하나만 바꾸면 사전학습된 GPT가 BERT로 바뀐다는 뜻은 아니다.

현재 `lrn-gpt`의 흐름은 `tokenizer → token ID → token+position embedding → Transformer blocks → final LayerNorm → LM head logits`다. batch B·길이 T·폭 D·어휘 V이면 hidden은 `(B,T,D)`이고 logits는 `(B,T,V)`다. 학습 loss는 logits와 정답을 직접 받고, 생성의 선택 확률이 필요할 때 softmax를 사용한다.

## 한 칸 이동한 정답을 모든 위치에서 학습한다

토큰 `[40,827,1500,91]`에서 input=`[40,827,1500]`, target=`[827,1500,91]`로 만든다. causal mask 덕분에 두 번째 target을 예측할 때 input의 미래 위치를 직접 볼 수 없다. T개 입력으로 T개 다음 토큰을 예측하려면 마지막 정답까지 포함해 T+1개 토큰이 필요하다. 길이 T의 원문 하나만 자르면 인접 쌍은 T-1개다.

학습 window의 stride는 겹치는 문맥의 양을 정한다. stride=1은 같은 문맥을 많이 공유하고 stride=context_length는 input window의 중복을 줄인다. 이것만으로 과적합이나 분할 누수가 해결되지는 않는다. 다른 split에 거의 같은 문서·window가 섞이지 않도록 분할 단위를 먼저 정한다. 현재 실행기는 각 step에서 무작위 window 시작점을 뽑는다.

## block은 같은 구조에 독립된 파라미터를 갖는다

일반적으로 block마다 Q·K·V·출력 투영, 두 FFN 선형층, 두 LayerNorm의 gamma·beta를 따로 소유한다. block 내부에서는 같은 FFN 가중치를 각 토큰에 사용하지만 서로 다른 block 사이의 공유는 별도 설계다. 현재 구현의 `nn.ModuleList([TransformerBlock(...) for ...])`는 독립 인스턴스를 만든다.

Attention이 토큰 사이 정보를 섞는다면 FFN은 각 토큰 벡터를 같은 함수로 변환한다. 기본 FFN은 `u=xW1+b1`, `h=GELU(u)`, `out=hW2+b2`이며 폭 D→4D→D로 확장했다 돌아온다. D=256이면 256→1024→256이고, 작은 예에서 `(6,3)@(3,8)→(6,8)@(8,3)→(6,3)`도 같은 구조다. residual의 두 항은 같은 shape여야 한다.

Residual `x+F(x)`는 직접 전달 경로를 만든다. 새 항이 기존 정보를 바꿀 수 있으므로 모든 원래 정보를 완전히 보존한다는 보장은 아니다. LayerNorm은 각 토큰의 마지막 D개 성분에서 평균·분산을 구하고 `gamma*(x-mean)/sqrt(var+eps)+beta`로 변환한다. 토큰끼리 통계를 섞지 않고 gamma·beta도 학습한다.

### Pre-LN과 Post-LN

| 구성 | attention 단계 | FFN 단계 |
|---|---|---|
| Pre-LN | `y=x+Attn(LN1(x))` | `out=y+FFN(LN2(y))` |
| Post-LN | `y=LN1(x+Attn(x))` | `out=LN2(y+FFN(y))` |

GPT-2 원본은 Pre-LN과 마지막 normalization을 사용한다. 현재 `lrn-gpt`는 `norm_first=True`면 Pre-LN, false면 Post-LN이며 기본값은 false다. 모델은 두 설정 모두 block 뒤 final_norm을 적용한다. 실험에서 정규화 위치를 비교하려면 `norm_first` 값과 final_norm 유무를 함께 기록해야 한다. Pre-LN의 직접 residual 경로가 있다고 모든 gradient가 1로 유지되거나 학습이 항상 안정적인 것은 아니다.

### 직접 경로가 있어도 전체 gradient는 달라진다

벡터 입력에서는 미분을 Jacobian 행렬로 읽는다. I는 항등행렬, J는 해당 함수의 Jacobian이라 하면 다음과 같다.

```text
Pre-LN:  y = x + F(LN(x))
          J_y = I + J_F · J_LN

Post-LN: y = LN(x + F(x))
          J_y = J_LN · (I + J_F)
```

Pre-LN에는 LayerNorm을 거치지 않는 직접 경로의 I가 남는다. 하지만 전체 Jacobian에는 다른 경로의 미분도 더해지고, 여러 블록을 통과하면 이 행렬들이 곱해진다. 직접 경로가 있다는 사실만으로 전체 gradient의 값이나 norm이 1이라고 결론낼 수는 없다. Post-LN은 잔차 합산 결과 전체가 LayerNorm의 미분을 통과한다.

Xiong 등의 연구는 분석한 초기화 조건에서 Post-LN의 출력 쪽 파라미터 gradient가 커질 수 있음을 설명하고, Pre-LN 실험에서는 warmup 없이도 비교 가능한 성능을 얻었다. 실제 선택에서는 초기화·학습률·깊이·학습 예산을 함께 비교해야 한다. 이 결과를 Post-LN은 warmup이 없으면 반드시 발산한다거나, Pre-LN이 항상 같은 성능을 더 빨리 얻는다는 규칙으로 바꿀 수는 없다. [On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745)

### 정규화할 값이 달라지면 출력도 달라진다

아래는 토큰 벡터 하나와 고정 선형 변환에 두 배치를 적용한 계산이다. LayerNorm의 gamma=1, beta=0으로 두어 평균·분산만 비교한다. Attention이나 실제 Transformer 학습을 실행하는 예제는 아니다.

```run-python
from math import sqrt

x = [1.5, -0.3, 0.8, 2.1]
w = [[0.1, 0.2, -0.1, 0.3],
     [0.0, -0.1, 0.2, 0.1],
     [0.3, 0.0, -0.2, 0.1],
     [-0.1, 0.1, 0.1, -0.2]]

def stats(v):
    mean = sum(v)/len(v)
    return mean, sum((a-mean)**2 for a in v)/len(v)

def layer_norm(v, eps=1e-5):
    mean, variance = stats(v)
    return [(a-mean)/sqrt(variance+eps) for a in v]

def sublayer(v):
    return [sum(v[i]*w[i][j] for i in range(len(v)))
            for j in range(len(v))]

post = layer_norm([a+b for a, b in zip(x, sublayer(x))])
pre = [a+b for a, b in zip(x, sublayer(layer_norm(x)))]
for name, result in [('Post-LN', post), ('Pre-LN', pre),
                     ('Pre-LN 뒤 final_norm', layer_norm(pre))]:
    mean, variance = stats(result)
    print(name, [round(a, 6) for a in result])
    print('평균:', round(mean, 6), '분산:', round(variance, 6))
assert abs(stats(post)[0]) < 1e-12
assert 0 < stats(post)[1] < 1
assert any(abs(a-b) > 1e-6 for a, b in zip(pre, post))
```

Post-LN의 마지막 연산은 정규화다. 이 예제처럼 affine 값을 고정하면 평균은 0에 가깝고 분산은 `v/(v+eps)`가 된다. Pre-LN은 입력에 서브레이어의 출력을 더한 상태로 끝난다. 그 결과가 입력의 크기에 항상 가깝다는 보장은 없으며, 학습한 gamma·beta를 적용한 일반 LayerNorm 출력도 평균 0·분산 1로 고정되지 않는다. `final_norm` 유무는 이 블록 내부 배치와 별도로 모델 전체에서 확인한다.

### 폭·깊이·head 수·초기화

폭 D, FFN 배수, block 개수 L은 파라미터 수와 계산량을 바꾼다. D를 고정한 채 H만 바꾸는 것은 전체 폭을 늘리는 일과 다르며 각 head 폭만 바뀔 수 있다. 현재 config는 `emb_dim`, `n_heads`, `n_layers`, `ffn_mult`, `qkv_bias`, `norm_first`, `norm_eps`, 활성화·dropout 위치·attention 구현·tying을 선택한다. 기본 D=256, H=8, L=6이지만 tokenizer와 context 크기도 함께 필요하다.

현재 일반 Linear·Embedding 가중치는 `init_std` 표준편차의 정규분포로, Linear bias는 0으로 초기화하고, LayerNorm gamma·beta는 1·0에서 시작한다. config의 seed 필드만으로 언제나 seed가 적용되는 것은 아니다. 모델 생성자의 debug seed 분기와 학습 진입점의 `set_seed` 호출을 함께 확인한다. seed를 고정해도 라이브러리·장치·연산의 결정성 조건이 달라지면 결과가 바뀔 수 있다. [현재 config](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/config.py), [현재 model](https://github.com/woonyong-kr/lrn-gpt/blob/027830d7f49904f656c2d3003d4f6a818ef50269/src/model.py)

## GPT-2 small의 파라미터를 같은 조건으로 센다

역사적인 GPT-2 small은 어휘 50,257·문맥 1,024·폭 768·12 blocks·12 heads 구성이다. GPT-2의 QKV와 출력 bias·FFN bias·LayerNorm affine을 모두 포함하면 한 block은 `12D²+13D`개다. token embedding과 LM head를 공유하는 조건의 합은 다음과 같다.

| 구성 | 파라미터 수 |
|---|---:|
| token embedding | 50,257×768 = 38,597,376 |
| position embedding | 1,024×768 = 786,432 |
| 12 blocks | 12×(12×768²+13×768) = 85,054,464 |
| final LayerNorm | 2×768 = 1,536 |
| 합 | 124,439,808 |

공유 head의 별도 가중치 수가 0이라는 뜻이지 logits 계산 비용이 0이라는 뜻은 아니다. QKV bias가 없는 `lrn-gpt`의 기본 설정이나 gated FFN에는 같은 식을 그대로 적용하지 않는다. 모델 이름의 대략적인 M 표기와 직접 센 수치도 구분한다. [GPT-2 원본 모델](https://github.com/openai/gpt-2/blob/master/src/model.py)

목적함수별 정답 위치와 Prefix LM의 비교는 [사전학습](/wiki/ai-machine-learning-topic-cf73c209b68a/)에서 다룬다.

## 생성은 마지막 logits에서 토큰을 골라 반복한다

Greedy는 마지막 위치의 가장 큰 logit을 고른다. Sampling은 temperature로 logits를 조정하고 필요하면 top-k 후보만 남겨 확률적으로 뽑는다. 작은 temperature는 더 집중된 분포를 만들지만 의미 정확성을 보장하지 않는다. 생성할 때는 eval로 Dropout을 끄고 gradient 기록을 비활성화한다.

현재 `lrn-gpt`는 checkpoint에서 모델·tokenizer·설정을 읽고 최근 context 길이만 입력한다. 이 방식은 오래된 문맥을 버리는 작은 구현이며 긴 문맥을 무제한 유지하는 모델이 아니다. 생성된 바이트열에 불완전한 UTF-8이 있을 수 있어 decode의 오류 처리도 결과에 영향을 준다. 문장이 출력되었다는 사실과 loss·마스크·학습 재개의 정확성은 따로 평가한다.

## BERT는 가린 위치를 양방향 문맥으로 복원한다

BERT의 encoder는 입력의 양쪽 문맥을 참조한다. 원래 사전학습은 MLM과 NSP를 사용한다. MLM은 특수 토큰 등을 제외한 후보 중 약 15%를 예측 대상으로 선택하고, 선택된 위치를 80%는 MASK, 10%는 임의 토큰, 10%는 그대로 둔다. 따라서 실제 MASK 표기로 교체되는 것은 전체 후보의 약 12%이며 loss는 선택된 모든 위치에서 계산한다. 원래 값이 남은 예측 위치도 loss 대상이다.

NSP는 문장 쌍이 실제로 이어지는지 분류하는 과업이다. 입력은 CLS·SEP 구분자와 token·position·segment embedding을 사용하고, 문장 수준 과업은 CLS 표현에 head를 연결할 수 있다. 토큰 분류나 추출형 QA에는 토큰별 head를 쓰므로 모든 BERT 출력이 CLS 하나라는 설명은 틀리다. BERT-base는 12 layers·폭 768·12 heads·약 110M, large는 24 layers·폭 1024·16 heads·약 340M이며 원래 최대 길이는 512다. [BERT 원 논문](https://arxiv.org/html/1810.04805v2)

512개 원문에서 다음 토큰 쌍 511개와 15% 선택 약 76개를 비교할 수 있지만, 예측 위치 개수만으로 GPT가 BERT보다 6.7배 데이터 효율적이라고 결론내릴 수 없다. 조건부 문맥·목적함수·과업이 다르다. padding·특수 토큰 제외와 반올림 규칙도 실제 개수를 바꾼다.

RoBERTa는 BERT 계열 사전학습에서 NSP 제거, 동적 masking, 더 큰 데이터·배치·학습 예산을 조사했다. tokenizer도 byte-level BPE로 바꿨으므로 ‘구조 외 모든 것은 같고 학습 시간만 늘렸다’는 비교는 아니다. 논문의 성능 개선을 모든 데이터에서 NSP가 쓸모없다는 보편 명제로 확장하지 않는다. [RoBERTa 논문](https://arxiv.org/abs/1907.11692)

## 분류 점수가 서비스의 판단이 되기까지

BERT의 문맥 표현에 분류 head를 붙이면 입력에 대한 클래스 점수를 만들 수 있지만, 그 점수만으로 서비스의 차단 여부가 정해지지는 않는다. 유해 콘텐츠를 판정하려면 범주 정의와 레이블 데이터, validation에서 정할 threshold, 오탐·미탐을 다룰 절차가 필요하다.

같은 점수 집합에서 threshold를 낮추면 더 많은 입력을 양성으로 분류한다. 이 때문에 놓치는 양성은 줄 수 있지만 정상 입력을 잘못 잡는 비용이 생긴다. precision이 모든 threshold 변화에서 단조롭게 움직인다고 보장하지는 않는다. 인용·반박·풍자 같은 문맥도 평가에 포함해야 한다.

NSMC 감성 분류는 리뷰의 긍정·부정을 구분하는 과업이다. 이 레이블은 유해성 레이블과 다르므로 감성 분류의 구현이나 정확도로 유해 콘텐츠 탐지 성능을 판단할 수 없다. 두 학습 노트는 BERT·GPT와 moderation의 설계 원리를 다루며, 별도 유해성 모델의 구현·배포 결과를 제공하지는 않는다. [BERT와 GPT의 차이 · 7875b64](https://github.com/woonyong-kr/lrn-gpt/blob/7875b64f85f19959d66dcaf06c1dcbeb129d71eb/docs/woonyong/03-bert-and-gpt.md) [BERT로 유해 콘텐츠를 감지하는 원리 · 7875b64](https://github.com/woonyong-kr/lrn-gpt/blob/7875b64f85f19959d66dcaf06c1dcbeb129d71eb/docs/woonyong/04-bert-harmful-content-detection.md)

## Transformer Explainer로 생성 과정을 살펴본다

[Transformer Explainer](https://poloclub.github.io/transformer-explainer/)는 브라우저에서 GPT-2를 실행하며 내부 계산과 다음 토큰 예측을 보여 주는 학습 도구다. [Attention](/wiki/ai-machine-learning-attention-820ced4d5b89/)의 계산과 이 문서의 생성 과정을 화면과 대조할 수 있다.

로컬 실행을 준비할 때는 코드를 가져온 commit과 Node.js·npm 버전, Lockfile을 함께 확인한다. 확인한 `bfe50af`의 README는 Node.js 20 이상과 npm 10 이상을 요구하며 다음 설치·실행 순서를 안내한다. 아래는 별도 터미널에서 개발 서버를 준비하는 명령이다. 이 문서의 Run 예제처럼 결과가 끝나는 단일 계산은 아니다.

```bash
git clone https://github.com/poloclub/transformer-explainer.git
cd transformer-explainer
git checkout bfe50afba10b9b560b84143ee1107d977defa74f
npm install
npm run dev -- --host 127.0.0.1
```

서버가 출력한 로컬 주소로 접속한다. README의 기본 포트는 5173이다. 패키지 선언을 확인한 것과 해당 조합의 설치·실행에 성공한 것은 다르며, 여기서는 새 로컬 실행 결과를 제시하지 않는다. [확인한 README](https://github.com/poloclub/transformer-explainer/blob/bfe50afba10b9b560b84143ee1107d977defa74f/README.md), [package.json의 명령과 의존성](https://github.com/poloclub/transformer-explainer/blob/bfe50afba10b9b560b84143ee1107d977defa74f/package.json)

화면을 열었다면 HTTP 응답만으로 실행 성공을 판단하지 않는다. 모델과 Tokenizer 요청이 끝나고 Generate가 활성화되는지, 예제와 직접 입력에서 다음 토큰 후보가 바뀌는지 확인한다. 모바일에서는 실제 화면에서 사용할 수 있는 입력 방식도 살펴야 한다. 로딩 시간과 다운로드 크기는 브라우저 Cache·네트워크·소스 버전에 따라 달라지므로 이전 측정값을 현재 결과처럼 사용하지 않는다.

`npm run build`와 `npm run check`도 확인하는 대상이 다르다. 빌드 성공 뒤에도 타입 검사나 접근성 진단이 남을 수 있고, 모델 요청 실패로 생성이 막힐 수 있다. 문제를 조사할 때는 설치 조합, 빌드, 타입 검사, 브라우저 Console·Network, 생성 결과를 구분한다. 학습 도구를 별도 서비스로 운영하려면 의존성 호환성·접근성·번들 크기와 모델·Tokenizer의 출처도 다시 확인한다.
