---
layout: default
title: Array
nav_order: 3
permalink: /wiki/programming-languages-runtime-topic-2ac2dfca2dd1/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-topic-2ac2dfca2dd1
projection_sha256: 6115c62c7f7a3835f740f242f6b323d63d7e53c94956e176f111aa3ad148fa56
parent: C
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/c
search_terms:
- 배열
grand_parent: 프로그래밍 언어
ancestor: Programming
---

# Array
{: .no_toc }

`int values[4] = {10, 20, 30, 40};`에서 `int *p = values;`로 시작 주소를 전달하면 `p[2]`와 `values[2]`는 같은 원소를 읽는다. 그렇다고 `p`가 배열의 길이까지 보관하는 것은 아니다. 배열 객체와 그 원소에 접근하는 포인터를 나누어 보면 인덱스 계산, 함수 인자, `sizeof`의 차이를 연결할 수 있다.

## 한 원소씩 이동하는 주소

배열은 같은 타입의 원소를 연속해서 보관한다. `values`가 첫 원소의 포인터로 변환된 문맥에서 `values + i`는 `i`번째 원소를 가리킨다. `values[i]`는 `*(values + i)`와 같은 방식으로 그 원소에 접근한다.

인덱스 하나를 옮길 때 필요한 크기는 `sizeof(values[0])`다. `int`가 4바이트인 환경이라면 원소 사이가 4바이트이지만, 모든 C 환경에서 `int`를 4바이트로 고정하지는 않는다. 배열의 인덱스 접근을 O(1)로 다루는 것은 시작 위치와 인덱스로 원소를 바로 찾는 계산 모델을 따른다. 실제 메모리 접근 시간에는 Cache와 주소 변환 등의 영향도 있다.

다음 예제는 포인터를 통해 세 번째 원소를 바꾼 뒤 배열로 다시 읽고, 첫 원소부터 배열 끝까지의 거리를 원소 수로 계산한다.

```run-c
#include <assert.h>
#include <stddef.h>
#include <stdio.h>

static int sum(const int *items, size_t count) {
    int total = 0;
    for (size_t i = 0; i < count; ++i) {
        total += items[i];
    }
    return total;
}

int main(void) {
    int values[4] = {10, 20, 30, 40};
    int *p = values;
    size_t count = sizeof values / sizeof values[0];
    int *end = values + count;

    p[2] = 35;
    printf("세 번째 원소: %d / %d\n", values[2], *(p + 2));
    printf("원소 수: %zu, 끝까지 거리: %td\n", count, end - p);
    printf("합계: %d\n", sum(values, count));
    printf("배열 크기: %zu, 포인터 크기: %zu\n", sizeof values, sizeof p);
    assert(count == 4 && end - p == 4 && sum(values, count) == 105);
    return 0;
}
```

`end`는 마지막 원소 다음 위치를 가리킨다. 반복을 끝내거나 같은 배열 안의 거리를 구할 때는 사용할 수 있지만, `*end`로 값을 읽으면 안 된다. 포인터 산술로 배열 범위를 벗어나는 주소를 만들어도 안전하다고 볼 수 없다. 두 포인터의 뺄셈 역시 같은 배열의 원소 또는 끝 다음 위치 사이에서 이루어져야 한다. [C11 초안 §6.5.2.1, §6.5.6](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

## 배열 전체와 첫 원소

배열 식은 대부분의 문맥에서 첫 원소의 포인터로 변환된다. 이 변환을 array-to-pointer conversion 또는 decay라고 부른다. 배열이 메모리에서 사라지거나 포인터 변수로 바뀌는 것이 아니라, 그 식에서 사용할 값이 첫 원소의 주소가 되는 것이다.

`sizeof values`와 `&values`는 배열 자체를 다룬다. 위 예제의 타입을 비교하면 차이가 드러난다.

| 표현 | 타입 또는 결과 | 다루는 대상 |
|---|---|---|
| `values`가 포인터로 변환된 값 | `int *` | 첫 원소 |
| `&values[0]` | `int *` | 첫 원소 |
| `&values` | `int (*)[4]` | 원소 4개인 배열 전체 |
| `&p` | `int **` | 포인터 변수 `p` |
| `sizeof values` | `4 * sizeof(int)` | 배열 객체의 크기 |
| `sizeof p` | `sizeof(int *)` | 포인터 객체의 크기 |

`int (*whole)[4] = &values;`에서 `whole + 1`은 배열 전체 하나를 지난 위치이고, `p + 1`은 정수 원소 하나를 지난 위치다. 시작 위치가 같아 보여도 타입이 다르면 한 칸의 단위가 다르다. [배열 변환과 sizeof: C11 초안 §6.3.2.1, §6.5.3.4](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

배열 전체에는 `values = other;`처럼 대입할 수 없다. 배열 원소는 수정할 수 있지만, 배열 객체 자체는 대입 연산의 수정 가능한 lvalue가 아니기 때문이다. 다른 값을 넣으려면 원소를 복사하거나 목적에 맞는 복사 함수를 사용한다.

함수 매개변수의 `int items[]`는 포인터 타입으로 조정된다. 따라서 함수 안의 `sizeof items`는 호출자가 사용한 배열의 크기를 알려 주지 않는다. 예제의 `sum()`은 첫 원소의 포인터와 함께 길이 `count`를 별도 인자로 받는다.

## 문자열 주소가 들어 있는 배열

문자열은 NUL 문자 `\0`까지 이어지는 문자들의 열이다. `char *`는 그 첫 문자를 가리킬 수 있는 포인터이며 문자열 자체와 같은 말은 아니다. 문자열 리터럴의 내용을 바꾸면 안 되고, 수정하려면 쓰기 가능한 문자 배열을 준비해야 한다.

문자 배열의 주소 여러 개를 모으면 포인터 배열이 된다. 배열의 첫 원소는 `char *`이므로 그 원소를 가리키는 포인터의 타입은 `char **`다.

```run-c
#include <assert.h>
#include <stdio.h>

int main(void) {
    char command[] = "ls";
    char option[] = "-l";
    char directory[] = "/home";
    char *arguments[] = {command, option, directory, NULL};
    char **argv = arguments;

    argv[1][1] = 'a';
    printf("두 번째 인자: %s\n", option);
    printf("세 번째 인자의 첫 문자: %c\n", argv[2][0]);
    for (size_t i = 0; argv[i] != NULL; ++i) {
        printf("argv[%zu] = %s\n", i, argv[i]);
    }
    assert(option[1] == 'a' && argv[3] == NULL);
    return 0;
}
```

`argv[1]`은 두 번째 문자열의 주소를 읽고, `argv[1][1]`은 그 문자열의 두 번째 문자를 선택한다. 예제에서는 쓰기 가능한 `option` 배열이므로 `-l`이 `-a`로 바뀐다. 마지막 NULL은 포인터 배열의 끝을 알리는 값이고, 각 문자열 끝의 NUL 문자와 역할이 다르다.

`main(int argc, char **argv)`에서도 `argv`는 문자열 포인터 배열에 접근하는 매개변수다. `argc`는 인자 수이며 `argv[argc]`는 NULL 포인터다. `char *argv[]`로 선언한 매개변수도 이 문맥에서는 `char **`로 조정된다. [C11 초안 §5.1.2.2.1, §6.7.6.3, §7.1.1](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

## PintOS가 인자 배열을 채우는 위치

`lrn-pintos`의 `5afaa6d` 버전에서 `load()`는 `char *argv[64]`와 `int argc`를 준비하고 `parse_command_line(fn_copy, argv, &argc, sizeof argv / sizeof *argv)`를 호출한다. 배열의 크기를 계산하는 곳은 `load()`이고, 분리 함수는 시작 주소·카운터의 주소·용량을 따로 받는다.

이 함수에서 `command`는 명령줄 문자들을, `argv`는 토큰 주소를 기록할 배열을 가리킨다. `argc`는 호출자가 가진 정수의 주소다. `strtok_r()`에 넘기는 `&save_point` 역시 함수가 포인터 변수의 값을 갱신하도록 주소를 전달하는 경우다.

다음은 같은 인자 기록 방식을 POSIX C 환경에서 실행하는 예제다. PintOS Kernel을 실행하는 코드는 아니며, 일반 C 실행 환경의 `strtok_r()`를 사용한다.

```run-c
#define _POSIX_C_SOURCE 200809L
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

static bool parse_command_line(char *command, char **argv,
                               int *argc, size_t capacity) {
    if (command == NULL || argv == NULL || argc == NULL) {
        return false;
    }
    *argc = 0;
    char *saved = NULL;
    for (char *token = strtok_r(command, " ", &saved);
         token != NULL; token = strtok_r(NULL, " ", &saved)) {
        if ((size_t)*argc >= capacity) {
            return false;
        }
        argv[(*argc)++] = token;
    }
    return *argc > 0;
}

int main(void) {
    char command[] = "  program one  two ";
    char *arguments[4] = {NULL};
    int count = -1;
    bool ok = parse_command_line(command, arguments, &count,
                                 sizeof arguments / sizeof *arguments);
    assert(ok && count == 3);
    printf("인자 수: %d\n", count);
    for (int i = 0; i < count; ++i) {
        printf("argv[%d] = %s\n", i, arguments[i]);
    }

    char too_many[] = "a b c";
    char *small[2] = {NULL};
    bool fits = parse_command_line(too_many, small, &count, 2);
    printf("용량 초과: %s, 기록된 인자 수=%d\n", fits ? "허용" : "거부", count);
    assert(!fits && count == 2);
    return 0;
}
```

`argv[(*argc)++] = token`은 증가 전 카운터를 인덱스로 사용해 토큰 주소를 기록하고 카운터를 증가시킨다. 이 식에서 배열 저장과 증가가 각각 어떤 기계 명령 순서로 실행된다고 단정할 필요는 없다. 정상 반환 뒤의 배열과 카운터가 다음 동작의 입력이 된다. 용량을 넘으면 실패하지만, 이미 바꾼 명령줄과 기록한 배열을 원상 복구하지는 않는다. [PintOS의 분리 함수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L937)

이 단계의 배열 원소들은 아직 Kernel에 복사한 명령줄 안을 가리킨다. 사용자 프로그램에 전달하려면 문자열을 사용자 Stack으로 옮기고 각 `argv[i]`를 새 주소로 바꾸어야 한다. `setup_initial_stack()`이 `char *stack_p`에서 문자열 길이만큼 빼는 것은 바이트 단위로 공간을 확보하기 위해서다. 이후 `sizeof(uintptr_t)`만큼 공간을 확보하고 `*(uintptr_t *)stack_p`에 주소 값을 기록한다.

이 x86-64 PintOS에서는 `uintptr_t`가 8바이트이지만 모든 C 환경에 같은 크기를 적용하지는 않는다. 이 타입을 통한 쓰기는 해당 Kernel의 주소 매핑과 정렬을 전제로 한다. 일반 C에서 임의의 문자 버퍼를 cast하면 어떤 타입이든 안전하게 쓸 수 있다는 뜻도 아니다. 문자 포인터만으로 여러 바이트를 복사할 수 없어서 cast를 쓰는 것은 아니며, `memcpy()`로도 바이트들을 복사할 수 있다. 여기서는 구현이 선택한 저장 타입과 위치를 읽는 것이다.

문자열·포인터 배열·NULL·레지스터를 연결하는 전체 배치와 용량·정렬 조건은 [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)에서 다룬다. 같은 `argv`라는 이름을 보더라도 지금 가리키는 배열이 Kernel의 지역 배열인지, 새 사용자 Stack의 포인터 배열인지부터 확인하면 각 대입의 의미를 구분할 수 있다.
