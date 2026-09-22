---
layout: default
title: 메모리 관리
nav_order: 6
permalink: /wiki/programming-languages-runtime-topic-a1c0b9893bd1/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-topic-a1c0b9893bd1
projection_sha256: d471d4dd5b72b76c12f3c6abbe57a027f1bde549d54a5b6b81c9dce58b623b80
parent: C
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/c
search_terms:
- 구조체 복사
- 포인터 멤버
- 얕은 복사
- strdup
- Use After Free
grand_parent: 프로그래밍 언어
ancestor: Programming
---

# 메모리 관리
{: .no_toc }

C에서 포인터는 객체에 접근하는 수단이다. 포인터 값이 남아 있다고 해서 그 객체의 크기와 수명, 초기화 상태까지 보장되지는 않는다. 동적 메모리를 사용할 때는 **얼마나 확보했는지, 무엇을 저장했는지, 누가 언제 해제하는지**를 함께 관리해야 한다.

## 할당과 해제의 계약

`malloc()`은 요청한 크기의 공간을 확보하고, 성공하면 그 공간을 가리키는 포인터를 반환한다. 실패하면 `NULL`을 반환하므로 사용 전에 확인해야 한다. 반환된 공간의 내용은 초기화되어 있지 않다. `calloc()`은 확보한 공간의 모든 비트를 0으로 만들지만, 모든 비트가 0인 표현을 어떤 타입에서나 Null Pointer나 부동소수점 0과 같다고 가정해서는 안 된다. [C 작업 초안 N3096, 7.24.3 메모리 관리 함수](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3096.pdf)

`free(NULL)`은 아무 일도 하지 않는다. 그 밖에는 `malloc()`·`calloc()`·`realloc()` 등 호환되는 할당 함수가 반환한, 아직 해제되지 않은 할당의 시작 포인터를 넘겨야 한다. 배열 중간 주소와 자동 지역 변수의 주소는 이 계약을 만족하지 않는다. 이미 해제한 할당을 다시 해제하는 것도 정의되지 않은 동작, 즉 Undefined Behavior다. [malloc과 free의 입력 조건](https://man7.org/linux/man-pages/man3/malloc.3.html)

| 호출 예 | 문제 |
| --- | --- |
| `free(p); free(p);` | 같은 할당을 두 번 해제한다. |
| `free(p + 1);` | 할당의 시작 포인터가 아닌 내부 주소를 넘긴다. |
| `int x = 42; free(&x);` | 동적 할당 함수가 반환하지 않은 객체를 해제하려 한다. |

위 코드는 잘못된 호출을 설명하는 조각이다. 오류가 발생한 뒤의 실행 결과는 정해져 있지 않다. ‘Double Free이면 다음 두 번의 malloc이 반드시 같은 주소를 돌려준다’처럼 특정 결과를 보장해서는 안 된다.

할당기의 Header가 항상 반환 주소 바로 앞의 8바이트에 있다는 규칙도 없다. 관리 정보의 위치와 검사 방식은 구현마다 다르다. 오류를 발견해 실행을 중단하는 할당기도 있고, 손상이 나중의 다른 할당에서 드러날 수도 있다. `free()`의 반환형이 `void`라는 사실만으로 잘못된 포인터를 검사할 수 없다거나, 특정 성능 비용 때문에 이런 계약이 선택되었다고 단정할 수는 없다. 호출자가 지켜야 하는 계약과 할당기 내부 구조를 구분해야 한다.

## 배열은 원소 수와 바이트 수를 구분한다

`int **a`로 포인터 배열을 만들 때 배열의 원소는 `int *`다. 따라서 n개 원소의 크기는 `n * sizeof *a`로 계산한다. `sizeof(int)`를 곱하면 정수의 크기를 사용하게 되어 원소의 타입과 맞지 않는다. 정수와 포인터가 우연히 같은 크기인 환경에 의존해서도 안 된다. 반대로 `int *a`로 정수 배열을 만들면 그때의 `sizeof *a`는 `int`의 크기다.

곱셈의 Overflow는 `malloc()`이 호출되기 전에 발생할 수 있다. `size_t`로 표현한 원소 수 n이 `SIZE_MAX / sizeof *a`보다 크면 필요한 바이트 수를 그 타입에 담을 수 없다. 다음 예제는 양의 원소 수만 받는 것으로 정하고, 크기 계산과 할당 결과를 확인한 뒤 배열을 사용한다.

```run-c
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    size_t n = 3;
    int **a;
    if (n == 0 || n > SIZE_MAX / sizeof *a) {
        return EXIT_FAILURE;
    }
    a = malloc(n * sizeof *a);
    if (a == NULL) {
        return EXIT_FAILURE;
    }
    for (size_t i = 0; i < n; ++i) {
        a[i] = NULL;
    }
    int value = 42;
    a[n - 1] = &value;
    printf("elements=%zu bytes=%zu\n", n, n * sizeof *a);
    printf("a[%zu]=%d\n", n - 1, *a[n - 1]);
    free(a);
    a = NULL;
    return EXIT_SUCCESS;
}
```

이 예제에서 `free(a)`는 포인터 배열의 저장 공간만 반환한다. 마지막 원소가 가리키는 `value`는 `main()`의 지역 객체이므로 `free()`에 넘기지 않는다. 포인터 배열을 할당했다고 각 원소가 가리킬 객체까지 함께 생기는 것은 아니다. 동적으로 만든 객체들을 원소에 저장했다면 그 객체들의 소유권과 해제도 따로 정해야 한다.

예제의 n=3에서는 마지막 원소인 `a[2]`를 읽어 42를 출력한다. 포인터가 8바이트인 환경에서는 배열 크기가 24바이트로 나온다. n=0은 이 예제에서 사용하지 않기로 정한 입력이며, 크기 0의 할당에 대한 모든 구현의 동작을 대신 설명하는 규칙은 아니다.

### 끝 바로 다음 주소에는 원소가 없다

n개 원소를 확보했다면 유효한 인덱스는 `0`부터 `n-1`까지다. `a+n`은 배열의 끝 바로 다음을 가리키는 경계 포인터로 만들 수 있지만, `a[n]`을 읽거나 쓸 수는 없다.

마지막 원소를 쓰려던 코드라면 `a[n-1]`이 맞다. 반면 `a[n]`에 끝 표시인 Sentinel을 저장하려는 설계라면 한 칸을 추가로 확보해야 한다. 이때는 `n+1` 자체의 덧셈과 이후 바이트 수 곱셈도 넘치지 않는지 확인한다. n=0과 끝 표시의 의도를 고려하지 않고 모든 `a[n]`을 `a[n-1]`로 바꾸면 또 다른 오류가 생긴다.

C 문자열에도 끝을 나타내는 `\0`이 필요하다. `"Hello, World!"`는 보이는 문자 13개에 종료 문자까지 14바이트를 차지하므로, 이를 `char buf[8]`에 `strcpy()`로 복사하면 공간이 부족하다. 필요한 크기는 복사할 데이터의 길이와 저장 형식을 함께 보고 계산한다.

## 포인터와 객체의 수명이 어긋날 때

Dangling Pointer는 가리키던 객체의 수명이 끝났는데도 그 객체를 참조하려는 포인터가 남는 상황을 말한다. 동적 메모리를 해제한 뒤 사용하는 Use After Free뿐 아니라, 수명이 끝난 지역 객체의 주소를 사용하는 경우에도 문제가 생긴다. 물리 메모리의 바이트가 우연히 그대로 남아 있더라도 유효한 객체로 계속 사용할 수 있는 것은 아니다.

Memory Leak은 필요 없어진 할당을 회수하지 못하고 보유하는 문제다. 할당의 주소를 잃어버리는 것이 대표적인 원인이지만, 불필요한 참조를 계속 유지하며 해제를 놓치는 경우도 있다. 예를 들어 첫 할당의 주소를 보존하거나 해제하지 않고 같은 포인터에 두 번째 `malloc()`의 결과를 대입하면 첫 할당에 대한 반환 경로를 잃을 수 있다. 오래 실행되는 프로그램에서는 이런 누수가 누적되어 메모리 부족으로 이어질 수 있다.

두 문제는 서로 반대되는 방향의 수명 불일치다. Dangling Pointer는 끝난 객체를 계속 사용하려 하고, 누수는 끝내야 할 할당을 남겨둔다. 지역 포인터의 수명이 끝나도 동적 할당이 자동으로 해제되는 것은 아니다.

해제 뒤 `p = NULL`로 대입하면 그 변수로 같은 포인터를 다시 넘기는 실수를 줄일 수 있다. 그러나 `q = p`로 복사해 둔 별칭까지 바뀌지는 않는다. `free(p); p = NULL;` 뒤에도 q로 해제된 객체에 접근하면 잘못이다. Null 대입만으로 소유권 문제를 해결할 수는 없다. Null Pointer를 역참조하는 것도 Undefined Behavior이므로, NULL 대입을 즉시 Crash하게 만드는 탐지 장치로 삼을 수는 없다. [C 작업 초안 N3096, 6.5.3.2](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3096.pdf)

### 구조체를 복사해도 문자열 할당은 늘어나지 않는다

포인터가 구조체의 멤버여도 같은 문제가 생긴다. 다음은 구조체 대입의 관계를 보여 주는 설명용 조각이다. `a`가 이미 초기화되어 있고, `a.name`은 살아 있는 동적 할당에 저장된 수정 가능한 문자열을 가리킨다고 가정한다.

```c
struct Node {
    int id;
    char *name;
};

/* a는 위 조건을 만족하도록 초기화된 struct Node 객체다. */
struct Node b = a;
```

`b.id`와 `b.name`에는 a의 해당 멤버 값이 복사된다. 따라서 `b.id`를 바꿔도 `a.id`는 바뀌지 않지만, `a.name`과 `b.name`은 여전히 같은 문자열을 가리킨다. 문자열이 살아 있고 수정 가능한 동안 `b.name[0]`을 바꾸면 `a.name`으로 읽는 내용도 달라진다.

구조체 대입은 멤버 값을 복사하지만 패딩 비트의 복사까지 보장하지는 않는다. 따라서 `memcpy()`처럼 객체 표현의 바이트를 그대로 옮기는 것과 완전히 같지는 않다. 포인터 멤버의 값이 복사되어도 그 포인터가 가리키는 문자열은 자동으로 복제되지 않는다. [C11 초안 N1570, 6.2.6.1 각주 51·6.5.16.1](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

두 객체가 같은 할당을 공유한다면 해제 책임을 정해야 한다. `free(a.name)` 뒤에 `b.name`으로 문자열에 접근하면 Use After Free이고, `free(b.name)`까지 호출하면 같은 할당의 중복 해제다. 해제 후 접근과 중복 해제는 Undefined Behavior이므로 이후 출력이나 Crash 여부는 정해져 있지 않다.

문자열을 각각 소유하게 하려면 종료 문자까지 담을 별도 공간을 확보하고, 할당 성공을 확인한 뒤 내용을 복사해야 한다. 실패하면 기존 소유 관계를 유지할지 작업을 실패로 돌릴지도 정해야 한다. 별도 복사가 성공했다면 각 할당은 각 소유자가 한 번씩 해제한다. POSIX 등 `strdup()`을 제공하는 환경에서는 이 함수로 종료 문자를 포함한 문자열의 복사본을 별도 할당에 만들 수 있다. 이때도 반환값이 `NULL`인지 확인하고 성공한 할당은 `free()`로 해제한다. [strdup의 할당·실패·해제 계약](https://man7.org/linux/man-pages/man3/strdup.3.html)

포인터를 복사하는 것과 가리키는 객체를 복사하는 것의 구분은 [Python 기본 문법의 복사 설명](/wiki/programming-languages-runtime-topic-ced5bd855b7b/)과 연결되지만, C의 명시적 해제 책임을 Python의 참조와 동일하게 취급해서는 안 된다.

## 오류가 드러나는 위치

| 오류 | 잘못된 코드의 예 | 확인할 조건 |
| --- | --- | --- |
| Buffer Overflow | `char buf[8]; strcpy(buf, "Hello, World!");` | 종료 문자를 포함한 저장 공간이 충분한가 |
| Use After Free | `free(p); p[0] = 'A';` | 접근하는 동안 객체가 살아 있는가 |
| Double Free | `free(p); free(p);` | 같은 할당의 해제 책임이 중복되지 않는가 |
| Memory Leak | 해제 없이 마지막 포인터를 덮어쓰거나 함수에서 반환 | 할당을 더 이상 사용하지 않을 때 회수할 경로가 있는가 |
| Uninitialized Read | `int *p = malloc(sizeof *p);` 직후 초기화 없이 `*p`를 읽음 | 해당 타입의 값을 먼저 저장했는가 |

`malloc()`의 초기화되지 않은 내용이 이전과 같아 보이는 것은 그 값을 사용해도 된다는 근거가 아니다. 할당기가 같은 프로세스 안의 해제된 블록을 재사용하는 경우와 OS가 다른 프로세스의 메모리를 제공하는 경우를 구분해야 한다. ‘이전 내용이 남을 수 있다’를 ‘다른 프로세스의 비밀을 그대로 받는다’로 일반화해서는 안 된다.

잘못된 접근은 즉시 실패할 수도 있지만, 다른 객체나 할당기의 관리 정보를 손상시킨 뒤 한참 나중에 드러날 수도 있다. 할당기의 오류 진단에 따른 중단, 접근 권한을 위반한 주소에서의 Fault, 손상된 데이터로 계산을 이어가는 상황은 서로 다른 결과다. 이런 손상이 보안 문제로 이어질 수 있어도, 모든 잘못된 `free()`가 같은 공격이나 Crash로 이어지는 것은 아니다. 오류의 발생 지점과 관찰된 실패 지점을 나눠 추적해야 한다.

AddressSanitizer는 컴파일러가 넣은 검사와 Runtime으로 Use After Free 같은 잘못된 메모리 접근을 찾는다. Linux의 Generic KASAN도 Shadow Memory에 기록한 접근 가능 상태를 검사하며, Tag를 사용하는 KASAN 모드도 있다. 검사 범위와 보고 뒤 실행을 중단할지는 도구·모드·설정에 따라 확인해야 한다. 해제된 영역에 특정 바이트를 써 두는 것만으로 이 검사가 이루어지거나 모든 오류가 즉시 Crash하는 것은 아니다. [AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html), [KASAN의 검사 방식과 보고 설정](https://docs.kernel.org/dev-tools/kasan.html)

누수에는 별도 진단이 필요하다. 지원되는 환경에서는 LeakSanitizer를 단독으로 쓰거나 AddressSanitizer와 함께 사용할 수 있고, Valgrind의 Memcheck도 남은 할당의 도달 가능성을 조사한다. Linux의 kmemleak은 추적하는 Kernel 할당 중 참조를 찾지 못한 객체를 누수 후보로 보고하며, 그 메모리를 자동으로 해제하지 않는다. 오탐과 미탐이 있으므로 보고 내용은 실제 소유권·회수 경로와 대조해야 한다. 이런 도구가 PintOS에 기본 제공된다는 뜻은 아니다. [LeakSanitizer](https://clang.llvm.org/docs/LeakSanitizer.html), [Memcheck의 누수 검사](https://valgrind.org/docs/manual/mc-manual.html#mc-manual.leaks), [kmemleak](https://docs.kernel.org/dev-tools/kmemleak.html)

객체 수명과 실제 Stack·Heap 배치의 차이는 [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/)에서, 빈 블록의 분할·병합과 Arena 구현은 [OS의 메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/)에서 이어진다.
