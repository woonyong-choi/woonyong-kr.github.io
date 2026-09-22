---
layout: default
title: 시간 복잡도
nav_order: 3
permalink: /wiki/computer-science-topic-869aa2bd6535/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-869aa2bd6535
projection_sha256: 21fadb14d7c36cbc271205074f5dd492dab69270231003de18d85151f2c665cf
parent: 복잡도
content_status: ready
public_parent_id: Wiki/computer-science/complexity
search_terms:
- 시간 복잡도
- 이진 탐색
- 선형 탐색
- 비교 횟수
- 평균
- 최악
grand_parent: CS 기초
---

# 시간 복잡도
{: .no_toc }

정렬된 숫자 1,000개에서 없는 값을 찾을 때, 앞에서부터 읽는 코드는 숫자를 1,000개 확인해야 한다. 가운데를 보고 탐색 범위를 절반씩 줄이는 코드는 훨씬 적은 횟수로 끝난다. 입력이 2배가 되면 첫 코드의 확인 횟수는 2배가 되지만, 두 번째 코드는 한 단계 정도만 더 필요하다.

이처럼 입력 크기에 따라 필요한 연산량이 어떻게 증가하는지를 시간 복잡도로 설명한다. 여기서는 숫자 비교와 인덱스 접근을 상수 비용으로 보고 List의 길이를 n으로 둔다. 실제 실행 시간은 언어와 런타임, CPU, 캐시, 입력 상태에 따라서도 달라지므로 연산량과 측정 시간을 구분한다.

## 같은 자료에서 비교 횟수 세기

아래 코드는 같은 List에서 선형 탐색과 이진 탐색을 실행한다. 초시계로 시간을 재는 대신, 각 탐색이 List의 원소를 후보로 확인한 횟수를 함께 돌려준다. 이진 탐색의 횟수는 `==`와 `<`를 각각 센 값이 아니라, 가운데 원소를 고른 횟수다.

```run-python
def linear_search(values, target):
    checks = 0
    for index, value in enumerate(values):
        checks += 1
        if value == target:
            return index, checks
    return -1, checks


def binary_search(values, target):
    left, right = 0, len(values) - 1
    checks = 0
    while left <= right:
        middle = (left + right) // 2
        checks += 1
        if values[middle] == target:
            return middle, checks
        if values[middle] < target:
            left = middle + 1
        else:
            right = middle - 1
    return -1, checks


for size in (8, 16, 32):
    values = list(range(size))
    print(size, "개, 없는 값:", linear_search(values, size), binary_search(values, size))

values = list(range(16))
print("맨 앞의 값:", linear_search(values, 0))
print("빈 List:", linear_search([], 0), binary_search([], 0))
```

없는 값을 찾을 때 선형 탐색은 8·16·32개를 확인하고, 이진 탐색은 가운데 원소를 4·5·6번 확인한다. 선형 탐색은 최악 O(n), 이진 탐색은 최악 O(log n)이다. 맨 앞의 값을 찾는 선형 탐색은 한 번 비교해 끝나므로 최선 O(1)이다. 실패를 나타내는 -1은 비교 횟수와 다른 반환값이다.

이진 탐색은 자료가 정렬돼 있어야 하고 가운데 원소에 바로 접근할 수 있어야 한다. 정렬되지 않은 입력을 먼저 정렬한다면 그 비용도 전체 작업에 포함해야 한다. 값을 삽입·삭제할 때마다 정렬 상태를 유지하는 비용까지 이진 탐색의 조회 비용과 같다고 볼 수는 없다.

## 반복문 개수만으로 판단하지 않기

중첩 반복으로 중복을 검사하면 서로 다른 모든 쌍을 확인할 수 있다. 다음 코드는 실제 비교 횟수와 발견 여부를 함께 출력한다. List의 첫 원소에 접근하는 함수도 넣어, 입력을 훑는 동작과 인덱스 접근을 구분한다.

```run-python
def get_first(values):
    return values[0]


def has_duplicate(values):
    checks = 0
    for i in range(len(values)):
        for j in range(i + 1, len(values)):
            checks += 1
            if values[i] == values[j]:
                return True, checks
    return False, checks


print("첫 원소:", get_first([7, 8, 9]))
for values in ([1, 2, 3, 4], [1, 1, 3, 4], []):
    print(values, has_duplicate(values))

try:
    get_first([])
except IndexError:
    print("빈 List에는 첫 원소가 없다")
```

네 값이 모두 다르면 비교 횟수는 `3 + 2 + 1 = 6`이다. n개가 모두 다른 경우에는 `n(n-1)/2`쌍을 확인하므로 최악 O(n²)이다. 반면 처음 비교한 두 값이 같으면 한 번 만에 끝난다. 중첩 반복이 있다는 사실만으로 모든 입력의 비용이 같아지는 것은 아니다.

`get_first()`는 List를 훑지 않고 정해진 위치에 접근하므로 O(1)이다. List가 비었다면 `IndexError`가 발생한다. 시간 복잡도가 작다는 판단과 입력이 함수의 사용 조건을 충족하는지는 별도로 확인해야 한다.

고정 크기의 칸을 연속 배치한 [Array](/wiki/programming-languages-runtime-topic-2ac2dfca2dd1/)에서는 `시작 주소 + 인덱스 × 칸 크기`로 해당 칸의 위치를 계산한다. 앞의 원소를 하나씩 지나갈 필요가 없는 이유다. CPython의 List는 이런 배열에 객체의 참조를 저장하므로, 원소인 객체 자체가 모두 연속된 메모리에 놓인다는 뜻은 아니다. [CPython의 List 구현](https://docs.python.org/3/faq/design.html#how-are-lists-implemented-in-cpython)

반복이 두 겹이어도 안쪽 반복 횟수가 고정돼 있으면 전체는 O(n)일 수 있다. 반대로 겉으로는 반복문이 하나라도, 안에서 길이 n의 List를 복사하거나 검색한다면 그 비용이 매번 더해진다. 루프의 모양보다 본문에서 수행하는 일과 전체 반복 횟수를 함께 봐야 한다.

## 증가율을 비교할 때의 기준

다음 표는 대표적인 비용 함수의 증가 속도를 비교한다. 실제 코드의 정확한 연산 횟수를 Big O 기호에서 계산한 표는 아니다.

| 증가율 | 대표적인 동작 | 적용할 때 확인할 조건 |
|---|---|---|
| O(1) | List의 인덱스 접근 | 한 번의 위치 접근에 걸리는 비용을 상수로 본다. |
| O(log n) | 이진 탐색 | 정렬된 자료에서 가운데 위치에 바로 접근한다. |
| O(n) | 모든 항목 순회 | 각 항목을 처리하는 비용도 상수인지 확인한다. |
| O(n log n) | 병합 정렬, 퀵 정렬의 평균 비용 | 퀵 정렬의 최악 비용과 평균 입력 가정을 구분한다. |
| O(n²) | 모든 원소 쌍 비교 | 실제로 모든 쌍을 확인하는 입력인지 구분한다. |
| O(2ⁿ) | 모든 부분집합의 선택 여부 탐색 | 각 부분집합의 내용을 복사·출력하면 추가 비용이 든다. |
| O(n!) | 모든 순열의 경우 탐색 | 순열 하나를 만들거나 출력하는 비용도 별도로 센다. |

예를 들어 n이 100만이면 n²은 1조이고, `n × log₂n`은 약 2천만이다. 이것은 두 수학식의 값 비교다. 초당 처리량을 임의로 가정해 계산한 시간을 실제 프로그램의 성능이라고 말해서는 안 된다. [Big O의 비용 모델](https://xlinux.nist.gov/dads/HTML/bigOnotation.html)

같은 O(n)이라도 상수 비용과 메모리 접근 방식 때문에 측정 결과는 다를 수 있다. 입력 규모가 큰 경로에서는 증가율을 먼저 보고, 실제 선택에서는 해당 입력과 환경에서 측정한 결과를 함께 사용한다.

시간을 줄이는 선택이 추가 메모리를 요구할 수도 있다. Array 기반 병합 정렬의 일반적인 구현은 O(n log n)의 시간과 함께, 병합 결과를 담는 크기 n의 보조 배열에 O(n)의 추가 공간을 사용한다. 알고리즘을 비교할 때는 처리 시간뿐 아니라 이런 공간 복잡도도 함께 살펴야 한다.
