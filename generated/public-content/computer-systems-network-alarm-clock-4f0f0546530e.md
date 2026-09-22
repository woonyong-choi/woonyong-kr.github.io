---
layout: default
title: Alarm Clock
nav_order: 2
permalink: /wiki/computer-systems-network-alarm-clock-4f0f0546530e/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-alarm-clock-4f0f0546530e
projection_sha256: 2e3c6c915db53e6357e30d9c56533a38a53a5fefeaea7f0349f53cc42f702a28
parent: 스레드 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-936b351311c8
search_terms:
- timer_sleep
- thread_sleep
- thread_awake
- sleep_list
- wake_tick
- loops_per_tick
- timer_calibrate
- busy_wait
- Lost Wakeup
grand_parent: PintOS
ancestor: CS 기초
---

# Alarm Clock
{: .no_toc }

`timer_sleep(50)`을 호출한 Thread는 기다리는 동안 CPU를 계속 차지할 필요가 없다. 깨울 시각을 남기고 실행 후보에서 빠졌다가, Timer Interrupt가 그 시각에 도달했음을 확인하면 다시 실행 후보가 되면 된다. PintOS의 Alarm Clock은 이 과정을 `sleep_list`와 BLOCKED·READY 상태 전환으로 구현한다.

## 기다리는 Thread를 실행 후보에서 빼기

PintOS의 초기 과제 코드는 `timer_elapsed(start)`를 반복 검사하면서 `thread_yield()`를 호출한다. CPU를 양보해도 Thread가 READY 상태에 남으므로, 다시 선택될 때마다 시간이 지났는지만 확인한다. 이런 Polling은 대기 중인 Thread의 수뿐 아니라 Scheduler가 선택하는 횟수에도 영향을 받는다.

현재 `lrn-pintos` 구현은 `timer_sleep()`에서 `start = timer_ticks()`를 읽고 `thread_sleep(start + ticks)`를 호출한다. `thread_sleep()`은 다음 순서로 대기 상태를 만든다.

```c
enum intr_level old_level = intr_disable ();
cur->wake_tick = wake_ticks;
list_insert_ordered (&sleep_list, &cur->elem, cmp_thread_ticks, NULL);
thread_block ();
intr_set_level (old_level);
```

마지막 줄은 다른 Thread로 넘어가기 전에 즉시 실행되는 코드가 아니다. 이 Thread가 나중에 깨어나 다시 실행될 때 `thread_block()` 다음으로 돌아와 이전 IF 상태를 복원한다. `thread_block()`은 외부 IRQ 문맥이 아니고 IF가 꺼진 상태인지 검사한다. [현재 sleep 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c), [Timer 진입 함수](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/devices/timer.c)

`wake_tick`은 남은 시간이 아니라 **부팅 이후 누적 tick으로 나타낸 깨울 시각**이다. 현재 tick이 1,000이면 `timer_sleep(50)`의 목표는 1,050이다. `sleep_list`는 이 시각이 빠른 순서로 정렬된다. 한 Thread의 `elem`은 자는 동안 `sleep_list`에, 깨어난 뒤에는 `ready_list`에 들어간다.

`sleep_list`는 양방향 연결 목록이다. 비교 함수는 `wake_tick`이 더 작은지를 검사하므로 같은 깨움 시각을 가진 Thread도 함께 들어갈 수 있다. `thread_awake()`는 한 tick에서 조건에 맞는 대상을 모두 꺼낸다. 다만 Sleep Queue의 순서와 Ready Queue의 우선순위 순서는 서로 다르다. 같은 tick에 깨워도 실행 순서까지 같아지는 것은 아니다.

이 구현은 별도의 Sleep 취소 API를 제공하지 않는다. 현재 대기 항목 수는 실행 중인 Thread와 다른 대기 구조의 상태에 따라 달라지므로, 전체 Thread 수에서 1을 뺀 값을 항상 실제 목록 길이로 사용할 수는 없다.

## 깨울 시각과 다시 실행할 시각

매 Timer Interrupt에서 `thread_awake(ticks)`는 목록 앞을 읽는다. `wake_tick > ticks`이면 이후 항목도 아직 시간이 되지 않았으므로 멈춘다. 그렇지 않으면 항목을 빼고 `thread_unblock()`으로 READY 상태로 바꾼다.

예를 들어 A·B·C·D가 각각 1,020·1,035·1,050·1,100에 깨어나도록 기다리고 있다면, tick 1,050에서는 A·B·C의 기한이 모두 지난 상태다. 이전 tick에서 아직 처리하지 못한 항목이 남아 있어도 `<=` 조건으로 함께 꺼낼 수 있다.

**READY는 곧바로 실행 중이라는 뜻이 아니다.** 현재 코드의 `thread_unblock()`은 우선순위에 맞게 Ready Queue에 넣고 상태를 바꾸지만, 그 함수 자체가 CPU를 넘기지는 않는다. `thread_awake()`에도 별도의 `check_preemption()` 호출은 없다. 실행 재개 시점은 외부 IRQ 반환 시의 양보와 Scheduler의 선택까지 함께 살펴야 한다. [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)의 EOI·양보 순서가 이 지점과 이어진다.

정렬된 Linked List에 삽입하는 데는 대기 항목 수 n에 대해 O(n)이 든다. 깨우는 쪽의 `sleep_list` 탐색과 제거만 보면 만료 항목 k개와 첫 미만료 항목을 확인하므로 O(k + 1)이다. 실제 `thread_unblock()`은 정렬된 `ready_list`에도 삽입하므로, 전체 IRQ 비용에 Ready Queue의 삽입 비용이 더해진다. 전체 깨우기를 무조건 O(1)이라고 표현할 수는 없다.

### 마감 시각과 상태를 바꿔 보는 예제

아래 코드는 대기 항목의 정렬과 상태 전환만 보여 준다. Python List를 사용하므로 PintOS Linked List의 연산 비용을 측정하는 예제는 아니다. 실제 Thread도 실행하지 않는다.

```run-python
from bisect import insort_right

sleepers = []
states = {}

def sleep(name, deadline):
    states[name] = "BLOCKED"
    insort_right(sleepers, (deadline, name))

def awake(tick):
    ready = []
    while sleepers and sleepers[0][0] <= tick:
        deadline, name = sleepers.pop(0)
        assert states[name] == "BLOCKED"
        states[name] = "READY"
        ready.append(name)
    return ready

for name, deadline in [("A", 1020), ("B", 1035), ("C", 1050), ("D", 1100)]:
    sleep(name, deadline)
for tick in [1019, 1020, 1035, 1050]:
    print(f"tick {tick}: ready={awake(tick)}, pending={sleepers}")

# 등록 전에 마감 시각이 지나도 <= 검사 때문에 다음 검사에서 깨운다.
sleep("late", 1050)
print(f"late registration at 1050: next tick ready={awake(1051)}")

# 등록과 BLOCKED 전환 사이를 보호하지 않은 잘못된 순서.
states["unsafe"] = "RUNNING"
insort_right(sleepers, (1052, "unsafe"))
try:
    awake(1052)
except AssertionError:
    print("unblock before BLOCKED: rejected")
```

실행 결과:

```text
tick 1019: ready=[], pending=[(1020, 'A'), (1035, 'B'), (1050, 'C'), (1100, 'D')]
tick 1020: ready=['A'], pending=[(1035, 'B'), (1050, 'C'), (1100, 'D')]
tick 1035: ready=['B'], pending=[(1050, 'C'), (1100, 'D')]
tick 1050: ready=['C'], pending=[(1100, 'D')]
late registration at 1050: next tick ready=['late']
unblock before BLOCKED: rejected
```

마감 시각이 지난 뒤 등록한 `late`도 다음 검사에서 READY가 된다. `wake_tick == tick`만 검사했다면 놓칠 항목을 `<=`로 처리하기 때문이다. 마지막에는 RUNNING 상태인 Thread를 먼저 목록에 넣고, BLOCKED로 바꾸기 전에 깨우는 잘못된 순서를 만들어 상태 검사가 이를 거부하게 했다.

## 인터럽트를 꺼야 하는 구간

`wake_tick` 기록, 목록 삽입, BLOCKED 전환은 Timer의 깨우기와 중간에 섞이지 않아야 한다. 특히 목록에 들어갔지만 아직 RUNNING인 순간에 IRQ가 들어오면, 현재 `thread_unblock()`의 `THREAD_BLOCKED` 검사가 실패할 수 있다. 상태와 목록을 잘못 분리한 다른 구현에서는 이미 받은 깨우기를 덮어쓰고 다시 잠드는 Lost Wakeup이 생길 수도 있다.

반면 “마감 시각이 지났는데 아직 목록에 없었다”는 상황만으로 현재 구현이 영원히 잠든다고 설명할 수는 없다. 다음 tick의 `<=` 검사로 발견할 수 있기 때문이다. `timer_ticks()`를 읽은 뒤 `thread_sleep()`이 IF를 끄기 전까지 시간이 흐를 수 있으므로, 그 사이의 지연과 목록·상태 변경의 원자성을 구별한다.

현재 `timer_sleep()`에는 0이나 음수 요청을 즉시 반환하는 분기가 없다. 이런 값을 직접 전달해도 `thread_sleep()`에 들어가며 다음 깨우기 검사까지 차단될 수 있다. 반면 `timer_usleep(0)`은 아래의 짧은 지연 분기에서 반복 횟수가 0이 된다. 두 API의 경계 동작이 같다고 가정하지 않는다.

## tick으로 표현하기 어려운 짧은 지연

PIT의 목표 주파수가 `TIMER_FREQ = 100`이면 한 tick의 명목상 간격은 약 10ms다. `real_time_sleep(num, denom)`은 요청한 `num / denom`초를 정수 tick으로 바꾼다.

```c
int64_t ticks = num * TIMER_FREQ / denom;
if (ticks > 0)
    timer_sleep (ticks);
else
    busy_wait (loops_per_tick * num / 1000
               * TIMER_FREQ / (denom / 1000));
```

양수 요청에서 `timer_usleep(500)`은 0 tick이 되어 Busy-wait로 내려간다. `timer_msleep(25)`는 정수 나눗셈 결과인 2 tick을 기다린다. 25ms를 정확히 맞추거나 최소 25ms를 보장하는 Timer가 아니다. 호출 시점과 tick 경계, IRQ 전달 지연, READY 이후의 스케줄링 때문에 실제 기다린 시간도 달라진다.

`busy_wait()`의 반복 수를 정하는 값이 `loops_per_tick`이다. `timer_init()`이 PIT와 Handler를 준비하고, `thread_start()`가 IRQ 수락을 시작한 뒤, `timer_calibrate()`가 부팅 중 이 값을 구한다. 보정 중에는 `too_many_loops()`가 tick 경계를 기다리므로 IF가 켜져 있어야 한다.

`too_many_loops(n)`은 새 tick이 시작된 뒤 n번의 빈 루프를 실행하고 tick이 바뀌었는지 비교한다. 실행 환경·IRQ 지연·Compiler가 만든 코드에 영향을 받는 측정이며 CPU 주파수 자체를 읽는 것이 아니다. `busy_wait()`의 `NO_INLINE`과 `barrier()`도 빈 루프가 사라지거나 배치가 달라지는 영향을 줄이기 위해 사용한다. 실제 출력 `loops/s`는 `loops_per_tick * TIMER_FREQ`다.

### 현재 보정 루프의 비트 검사

확인한 소스는 1,024부터 시작해 값을 두 배로 늘린 뒤, `high_bit >> 1`부터 `high_bit >> 9`까지 **9개의 후보 비트**를 검사한다. 주석의 “다음 8비트”와 실제 반복 범위가 다르다.

```c
high_bit = loops_per_tick;
for (test_bit = high_bit >> 1;
     test_bit != high_bit >> 10;
     test_bit >>= 1)
    if (!too_many_loops (high_bit | test_bit))
        loops_per_tick |= test_bit;
```

후보 검사는 누적된 `loops_per_tick | test_bit`가 아니라 고정된 `high_bit | test_bit`로 한다. 따라서 통과한 비트들을 합친 최종 반복 수가 측정 경계보다 작다는 보장은 이 코드만으로 나오지 않는다. 다음 예제는 이 선택 과정을 일정한 경계값으로 바꾸어 확인한다.

```run-python
FREQ = 100
count = (1193180 + FREQ // 2) // FREQ
print(f"PIT count={count} (0x{count:04x}), bytes={count & 255:02x} {count >> 8:02x}")
print(f"QEMU PIT period={count / 1193182 * 1000:.6f} ms")

loops_per_tick = 500000  # 계산을 위한 입력값이며 측정값이 아니다.
for microseconds in [0, 500, 9999, 10000, 25000]:
    ticks = microseconds * FREQ // 1000000
    if ticks > 0:
        print(f"{microseconds} us -> sleep({ticks} ticks)")
    else:
        loops = loops_per_tick * microseconds // 1000 * FREQ // 1000
        print(f"{microseconds} us -> busy_wait({loops} loops)")

# timer_calibrate의 비트 선택만 검사하는 결정적 모델.
# 실제 시간 측정 대신 330000회를 경계로 두었다.
limit = 330000
loops = 1 << 10
while (loops << 1) < limit:
    loops <<= 1
high_bit = loops
test_bit = high_bit >> 1
trials = []
while test_bit != high_bit >> 10:
    candidate = high_bit | test_bit
    fits = candidate < limit
    trials.append((candidate, fits))
    if fits:
        loops |= test_bit
    test_bit >>= 1
print(f"bit trials={len(trials)}, first={trials[0]}, last={trials[-1]}")
print(f"combined loops={loops}, below model limit={loops < limit}")
```

실행 결과:

```text
PIT count=11932 (0x2e9c), bytes=9c 2e
QEMU PIT period=10.000151 ms
0 us -> busy_wait(0 loops)
500 us -> busy_wait(25000 loops)
9999 us -> busy_wait(499950 loops)
10000 us -> sleep(1 ticks)
25000 us -> sleep(2 ticks)
bit trials=9, first=(393216, False), last=(262656, True)
combined loops=392704, below model limit=False
```

예제의 `loops_per_tick = 500000`은 계산용 입력이고, 마지막의 330,000회 경계도 실제 보정 측정값이 아니다. 각 비트를 따로 시험해 통과해도 합친 값은 경계를 넘을 수 있다. 이 결과는 **비트 선택 알고리즘의 성질**을 보여 주며, 특정 PintOS 실행의 실제 지연 오차를 측정한 결과는 아니다.

같은 예제에서 count 11,932와 QEMU PIT 기준 주파수 1,193,182Hz를 나누면 약 10.000151ms가 나온다. 이것은 장치 모델의 주기 계산이다. `ticks`는 처리한 Timer IRQ의 누적값이고, Host의 Wall-clock을 그대로 읽는 값이 아니다. `timer_ticks()`는 인터럽트를 잠시 꺼서 공유 카운터를 읽는다. 64비트 CPU에서 정렬된 64비트 Load가 항상 찢어지기 때문에 이 보호가 필요하다고 설명하는 것도 부정확하다.

### 보정 출력과 오차를 읽는 법

부팅 출력이 가령 `49,152,000 loops/s`이고 `TIMER_FREQ`가 100이라면, `loops_per_tick`은 491,520으로 역산한다. 이 숫자는 계산 예시이며 특정 실행에서 관측한 값은 아니다. 위 실행 예제의 입력을 이 값으로 바꾸면 500µs 요청에 사용하는 반복 횟수도 확인할 수 있다.

후보 비트를 9번 검사한다고 해서 실제 지연의 오차가 0.2% 이내로 보장되지는 않는다. `too_many_loops()`가 다음 tick까지 기다리는 시간은 진입 시점에 따라 다르고, 그 뒤 Busy-wait와 IRQ 처리 시간도 더해진다. “호출마다 최소 10ms이므로 보정 전체가 170ms”라는 식으로 고정 비용을 계산할 수 없다. 또한 최종 반복 수보다 큰 2의 거듭제곱이 이미 첫 단계에서 통과했다는 가정은 서로 모순된다.

Linux v6.12도 `loops_per_jiffy`를 사용하지만 항상 PintOS와 같은 루프를 돌리지는 않는다. `calibrate_delay()`는 CPU별 기존 값, 지정한 값, Timer 주파수로 계산한 값, 아키텍처의 보정 방법 등을 먼저 확인하고 필요하면 `calibrate_delay_converge()`를 사용한다. Linux의 BogoMIPS 출력은 지연 루프 보정값을 환산한 것이며, PintOS의 `loops/s`나 CPU 성능 Benchmark와 동일하지 않다. [Linux 지연 보정](https://github.com/torvalds/linux/blob/v6.12/init/calibrate.c)

## 더 정밀한 Timer를 사용하는 경우

Linux v6.12의 `schedule_timeout()`은 `timer_list`와 `process_timeout()`을 사용하고, 만료 시 `wake_up_process()`로 연결한다. 이 경로를 곧바로 hrtimer라고 부르면 Timer 종류가 섞인다. 같은 버전의 Timer Wheel은 단계마다 64개 Bucket을 두며 단계가 높아질수록 시간 간격을 8배로 넓힌다. 예를 들어 HZ 1,000일 때 첫 세 단계의 범위는 0–63ms, 64–511ms, 512–4,095ms다. 이전의 고전적인 Wheel과 달리 하위 단계로 다시 옮기는 Cascading을 사용하지 않는다. [Linux v6.12 Timer 구현](https://github.com/torvalds/linux/blob/v6.12/kernel/time/timer.c)

High-resolution Timer와 짧은 Delay Loop는 다른 선택지다. API의 시간 단위가 ns라는 사실만으로 Thread가 정확히 그 시각에 다시 실행된다고 보장되지는 않는다. 대기할 수 있는 문맥인지, 허용 지연은 얼마인지, CPU를 계속 사용하는 비용이 적절한지를 함께 판단해야 한다. [Linux의 Delay·Sleep 선택 기준](https://cdn.kernel.org/doc/html/latest/timers/delay_sleep_functions.html)

## Debugger에서 확인할 위치

`thread_sleep()` 진입에서 인자인 절대 `wake_ticks`를 확인하고, `thread_awake()` 진입에서 현재 `global_ticks`와 비교한다. `thread_unblock()`에서는 대상 Thread가 BLOCKED인지, 복귀 후 READY로 바뀌는지 본다. 다음 명령은 Guest Debug Symbol을 사용할 때의 관찰 시작점이다.

```gdb
tbreak *thread_sleep
continue
p/d $rdi
p ticks
tbreak *thread_awake
continue
p/d $rdi
tbreak *thread_unblock
continue
set $woken = (struct thread *)$rdi
p $woken->status
p $woken->wake_tick
```

목록 전체의 순서와 남은 tick을 확인할 때는 다음처럼 저장된 `elem`에서 Thread 주소를 복원할 수 있다. `list_entry`와 `offsetof` Macro를 GDB가 알고 있다고 가정하지 않고, 현재 Debug Symbol의 필드 Offset을 계산한다. 출력은 실제 실행 상태에서 얻어야 한다.

```gdb
set $elem_offset = (unsigned long)&((struct thread *)0)->elem
set $e = 'thread.c'::sleep_list.head.next
set $count = 0
set $ordered = 1
while $e != &'thread.c'::sleep_list.tail
  set $t = (struct thread *)((char *)$e - $elem_offset)
  set $remaining = $t->wake_tick - 'timer.c'::ticks
  if $count == 0
    set $min_remaining = $remaining
    set $max_remaining = $remaining
  else
    if $t->wake_tick < $previous
      set $ordered = 0
    end
    if $remaining < $min_remaining
      set $min_remaining = $remaining
    end
    if $remaining > $max_remaining
      set $max_remaining = $remaining
    end
  end
  printf "tid=%d name=%s wake=%lld remaining=%lld\n", $t->tid, $t->name, $t->wake_tick, $remaining
  set $previous = $t->wake_tick
  set $count = $count + 1
  set $e = $e->next
end
p $count
p $ordered
if $count > 0
  p $min_remaining
  p $max_remaining
end
```

`alarm-multiple`처럼 여러 Thread가 잠드는 상황에서 삽입 순서, 같은 마감 시각, 한 번에 여러 항목을 깨우는 경우를 구별해 관찰한다. 삽입 직후부터 Block 직전까지의 IF는 `$eflags & 0x200`으로 확인한다. IF만 바뀌었다고 RFLAGS의 다른 Bit까지 모두 0이 되는 것은 아니다. 함수 첫 명령에서는 `wake_tick`이 아직 새 인자로 갱신되지 않았을 수 있으므로 `wake_ticks` 인자와 필드의 대입 전후도 구별한다.

보정은 `timer_calibrate()`와 `too_many_loops()`, 분기 선택은 `real_time_sleep()`에서 `num`, `denom`, 계산된 `ticks`를 확인한다. 함수 진입의 지역 변수는 아직 초기화되지 않았을 수 있으므로 대입문을 지난 위치에서 읽는다. Breakpoint로 실행을 멈추는 행위가 시간 측정에도 영향을 주므로, Debugger로 얻은 보정값을 일반 실행의 성능값으로 옮겨 적지 않는다.
