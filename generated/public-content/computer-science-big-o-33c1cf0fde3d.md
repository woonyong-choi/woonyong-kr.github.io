---
layout: default
title: Big O
nav_order: 2
permalink: /wiki/computer-science-big-o-33c1cf0fde3d/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-big-o-33c1cf0fde3d
projection_sha256: 5709b76972a0e5d6d2e25403b819fbc77f5e69911414b2fb4a587aa4b16d57b1
parent: 복잡도
content_status: ready
public_parent_id: Wiki/computer-science/complexity
search_terms:
- Big O
- 점근적 상한
- 지배항
- 상수 비용
- 최악
grand_parent: CS 기초
---

# Big O
{: .no_toc }

입력이 n개일 때 어떤 코드는 `3n + 7`번, 다른 코드는 `n²`번 연산한다고 하자. 작은 입력에서는 첫 코드의 연산이 더 많을 수도 있지만, 입력이 커질수록 두 식의 증가 속도는 달라진다. Big O는 이런 비용 함수가 충분히 큰 입력에서 어느 정도의 상한 안에 들어가는지 나타내는 표기다.

## 상수배로 덮을 수 있는 증가율

`3n + 7`은 n이 7 이상일 때 `4n`보다 크지 않다. 입력이 더 커져도 같은 상수 4를 곱한 n으로 비용을 덮을 수 있으므로 `3n + 7 = O(n)`이라고 쓴다. 입력마다 상수를 새로 고르는 것이 아니라, 한 번 정한 상수로 그 이후의 입력을 모두 다룬다는 점이 중요하다.

일반적으로 비용 함수 f(n)에 대해 양의 상수 c와 기준 크기 n₀를 정할 수 있고, 모든 n ≥ n₀에서 `0 ≤ f(n) ≤ c·g(n)`이면 `f(n) = O(g(n))`이다. 이때 g(n)은 상한의 증가율을 나타낸다. [NIST의 Big O 정의](https://xlinux.nist.gov/dads/HTML/bigOnotation.html)

O(1)도 정확히 한 번 연산한다는 뜻은 아니다. 입력 크기와 무관하게 일정한 상수 이하의 비용이면 O(1)이다. 3번과 100번의 고정 연산은 실제 비용이 다르지만 같은 상수 시간 범주에 들어간다.

## 큰 입력에서 남는 항

`n² + 100n + 10,000`에서는 충분히 큰 n에 대해 n² 항이 나머지보다 빠르게 증가한다. 아래 코드는 각 항의 값을 계산한다. 실행 시간을 재거나 그 값만큼 반복하는 예제는 아니다.

```run-python
n = 1_000_000
quadratic = n * n
linear = 100 * n
constant = 10_000

print(f"n²: {quadratic:,}")
print(f"100n: {linear:,}")
print(f"상수항: {constant:,}")
print(f"n² / 100n: {quadratic // linear:,}")
```

n²은 1조이고 100n은 1억이므로 두 항의 비율은 10,000이다. 이 식의 증가율을 나타낼 때 상수 계수와 더 느리게 증가하는 항을 걷어 내면 O(n²)이 남는다. 그렇다고 작은 입력에서도 상수 계수나 메모리 접근 비용을 무시해도 된다는 뜻은 아니다.

Big O의 상한이 반드시 가장 좁은 상한인 것도 아니다. `3n + 7`은 O(n)이면서 O(n²)이기도 하지만, 증가 속도를 비교할 때는 보통 O(n)처럼 더 유용한 상한을 쓴다. 상한과 하한이 같은 증가율로 맞아떨어진다는 뜻을 명확히 표현할 때는 Θ 표기를 사용한다. [상한과 Θ의 구분](https://xlinux.nist.gov/dads/HTML/bigOnotation.html)

## 표기와 입력의 경우를 구분하기

선형 탐색은 찾는 값이 맨 앞에 있으면 한 번 비교하고 끝나지만, 값이 없으면 모든 항목을 확인한다. 이 둘은 각각 최선 입력과 최악 입력의 비용 함수다. 각 함수에 Big O를 적용하면 최선 O(1), 최악 O(n)이라고 표현할 수 있다.

따라서 Big O 자체가 최악의 경우를 뜻하지는 않는다. 평균 비용에도 Big O를 쓸 수 있다. 다만 평균은 입력이 어떤 확률로 주어진다고 보는지에 따라 달라지므로, 입력 분포를 정하지 않은 채 ‘보통 빠르다’는 의미로 사용해서는 안 된다.

면접 답변이나 코드 설명에서는 먼저 [시간 복잡도](/wiki/computer-science-topic-869aa2bd6535/)의 기준 연산과 입력 크기를 정하고, 최선·평균·최악 중 어느 경우인지 밝힌 뒤 Big O를 붙이면 해석이 분명해진다. 같은 표기는 공간 복잡도에도 사용할 수 있다.
