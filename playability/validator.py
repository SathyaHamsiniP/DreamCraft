"""Search for movement paths, without treating search failure as a proof."""
import argparse
import heapq
import itertools
import json
import time
from dataclasses import dataclass
from pathlib import Path

from contracts import PHYSICS as P, overlaps, validate_level

DT = 1 / P['fps']


@dataclass(frozen=True)
class State:
    x: float
    y: float
    vy: float = 0
    grounded: bool = False
    jump_held: bool = False
    coyote: int = 0
    jump_buffer: int = 0


def rectangle(state):
    return {'x': state.x, 'y': state.y, 'width': P['player_width'], 'height': P['player_height']}


def advance(level, state, direction, jump):
    """Approximate one Arcade step with solid rectangles and edge-triggered jump."""
    old = rectangle(state)
    coyote = P['coyote_ticks'] if state.grounded else max(0, state.coyote - 1)
    buffer = P['jump_buffer_ticks'] if jump and not state.jump_held else max(0, state.jump_buffer - 1)
    launch = buffer > 0 and (state.grounded or coyote > 0)
    vy = P['jump_velocity'] if launch else state.vy
    if launch:
        coyote, buffer = 0, 0
    vy = min(vy + P['gravity'] * DT, P['max_fall_speed'])
    x = min(max(state.x + direction * P['speed'] * DT, 0), level['world']['width'] - P['player_width'])
    y = state.y + vy * DT
    if y < 0:
        y, vy = 0, 0
    grounded = False
    for platform in (o for o in level['objects'] if o['type'] == 'platform'):
        body = {'x': x, 'y': y, 'width': P['player_width'], 'height': P['player_height']}
        if not overlaps(body, platform):
            continue
        if old['y'] + old['height'] <= platform['y'] and vy >= 0:
            y, vy, grounded = platform['y'] - P['player_height'], 0, True
        elif old['y'] >= platform['y'] + platform['height'] and vy < 0:
            y, vy = platform['y'] + platform['height'], 0
        elif direction > 0 and old['x'] + old['width'] <= platform['x']:
            x = platform['x'] - P['player_width']
        elif direction < 0 and old['x'] >= platform['x'] + platform['width']:
            x = platform['x'] + platform['width']
        else:
            # Corner cases are not reliable enough to search through.
            return None, 'ambiguous_collision'
    result = State(x, y, vy, grounded, jump, coyote, buffer)
    if y >= level['world']['height'] or any(overlaps(rectangle(result), o) for o in level['objects'] if o['type'] == 'spike'):
        return None, 'dead'
    if any(overlaps(rectangle(result), o) for o in level['objects'] if o['type'] == 'goal'):
        return result, 'won'
    return result, 'playing'


def timing_assessment(level, path):
    """Probe jump timing in the approximation; this is not a human difficulty rating."""
    spawn = next(o for o in level['objects'] if o['type'] == 'spawn')
    inputs = [(a['direction'], a['jump']) for a in path for _ in range(a['frames'])]
    passed = []
    for offset in (-3, 3):
        state, outcome = State(spawn['x'], spawn['y']), 'playing'
        # Shift jump presses even when a press lasts only one frame.
        for tick in range(len(inputs) + abs(offset)):
            direction = inputs[min(tick, len(inputs) - 1)][0]
            source = tick - offset
            jump = inputs[source][1] if 0 <= source < len(inputs) else False
            state, outcome = advance(level, state, direction, jump)
            if outcome != 'playing':
                break
        passed.append(outcome == 'won')
    return {'status': 'timing_margin' if all(passed) else 'timing_sensitive',
            'tested_offset_frames': 3, 'source': 'python_approximation',
            'note': 'Jump timing was shifted by up to three frames. This does not measure player skill or prove an easy route.'}


def compact_path(path):
    """Group identical inputs while keeping the final position for replay checks."""
    result = []
    for action in path:
        if result and all(result[-1][key] == action[key] for key in ('direction', 'jump')):
            result[-1].update(frames=result[-1]['frames'] + action['frames'],
                              expected=action['expected'], tick=action['tick'])
        else:
            result.append(dict(action))
    return result


def max_jump_rise():
    velocity, height, peak = P['jump_velocity'], 0, 0
    while velocity < 0:
        velocity += P['gravity'] * DT
        height += velocity * DT
        peak = min(peak, height)
    return -peak


def check_playability(level, max_states=20000, max_seconds=3.0, max_ticks=1800):
    validate_level(level)
    if not 1 <= max_states <= 100000 or not 0 < max_seconds <= 10 or not 1 <= max_ticks <= 3600:
        raise ValueError('Search limits must be positive and within the supported bounds')
    started = time.monotonic()
    spawn = next(o for o in level['objects'] if o['type'] == 'spawn')
    goal = next(o for o in level['objects'] if o['type'] == 'goal')
    platforms = [o for o in level['objects'] if o['type'] == 'platform']
    warnings = ['The Python collision model is approximate. A returned route needs replay in Phaser.']
    info = {'expanded': 0, 'limit_reached': False, 'max_states': max_states, 'max_ticks': max_ticks, 'max_seconds': max_seconds,
            'input_step_frames': 0, 'position_resolution': 0, 'passes': 0}

    suggestions = []
    ordered = sorted(platforms, key=lambda p: p['x'])
    for left, right in zip(ordered, ordered[1:]):
        gap = right['x'] - left['x'] - left['width']
        if gap > 100:
            suggestions.append(f"The gap between {left['id']} and {right['id']} is {gap:g} units. Consider adding a platform or reducing this gap; other routes may exist.")
        rise = left['y'] - right['y']
        if rise > max_jump_rise():
            suggestions.append(f"The platform {right['id']} is {rise:g} units higher than {left['id']}. Consider an intermediate step or lowering it.")
    if not any(p['x'] < spawn['x'] + P['player_width'] and p['x'] + p['width'] > spawn['x']
               and p['y'] >= spawn['y'] + P['player_height'] - 1 for p in platforms):
        suggestions.append('The start is above a gap. Move toward a platform as you fall, or move the start above one.')

    def report(status, reason, path=None):
        return {'status': status, 'reason': reason, 'warnings': warnings, 'search': {**info, 'elapsed_ms': round((time.monotonic() - started) * 1000)}, 'physics_version': P['version'], 'verified_in_game': False, 'path': path, 'suggestions': suggestions, 'difficulty': timing_assessment(level, path) if path else {'status': 'not_assessed'}}

    # Even granting access to every platform, no jump can put the player's top
    # above this bound. The continuous rise is larger than the discrete rise,
    # so it is a conservative bound for the game too.
    rise_bound = P['jump_velocity'] ** 2 / (2 * P['gravity'])
    highest_top = min([spawn['y']] + [p['y'] - P['player_height'] - rise_bound for p in platforms])
    if goal['y'] + goal['height'] <= highest_top:
        return report('unreachable', 'The goal is above the highest possible player position, even if every platform were accessible. This bound assumes fixed solid platforms, no flying and no extra jumps.')

    depth_limited = False
    passes = [(6, 6, 30, 1), (1, .5, P['gravity'] * DT, 1.25)]
    # Reserve states for finer timing without cutting short a quick search on a busy CPU.
    coarse_states = max(1, int(max_states * .4))
    for pass_number, (stride, resolution, velocity_step, weight) in enumerate(passes, 1):
        info.update(passes=pass_number, input_step_frames=stride, position_resolution=resolution)
        pass_start = info['expanded']
        initial = State(spawn['x'], spawn['y'])
        counter = itertools.count()
        # Each stored node keeps its predecessor so a route can be replayed.
        nodes = [(initial, -1, None, 0)]
        queue = [(0., next(counter), 0)]
        visited = {}

        def key(s):
            return (round(s.x / resolution), round(s.y / resolution), round(s.vy / velocity_step), s.grounded, s.jump_held, s.coyote, s.jump_buffer)

        while queue:
            if info['expanded'] >= max_states or time.monotonic() - started >= max_seconds:
                info['limit_reached'] = True
                return report('unknown', 'No winning path was found within the search limit.')
            if pass_number == 1 and info['expanded'] - pass_start >= coarse_states:
                break
            _, _, index = heapq.heappop(queue)
            state, _, _, ticks = nodes[index]
            if visited.get(key(state), float('inf')) <= ticks:
                continue
            visited[key(state)] = ticks
            info['expanded'] += 1
            if ticks >= max_ticks:
                depth_limited = True
                continue
            for direction, jump in itertools.product((1, 0, -1), (False, True)):
                next_state, outcome, frames = state, 'playing', 0
                for _ in range(min(stride, max_ticks - ticks)):
                    next_state, outcome = advance(level, next_state, direction, jump)
                    frames += 1
                    if outcome != 'playing':
                        break
                if next_state is None:
                    continue
                action = {'direction': direction, 'jump': jump, 'frames': frames}
                next_index = len(nodes)
                nodes.append((next_state, index, action, ticks + frames))
                if outcome == 'won':
                    path = []
                    while nodes[next_index][1] != -1:
                        s, parent, a, t = nodes[next_index]
                        path.append({**a, 'expected': {'x': s.x, 'y': s.y, 'vy': s.vy}, 'tick': t})
                        next_index = parent
                    path.reverse()
                    return report('reachable', 'A route was found in the Python simulation. It has not been verified in Phaser for this request.', compact_path(path))
                if visited.get(key(next_state), float('inf')) <= ticks + frames:
                    continue
                distance = max(abs(goal['x'] - next_state.x) - goal['width'], 0) / (P['speed'] * DT)
                # Prefer progress toward the finish; the shortest route is not required.
                heapq.heappush(queue, (ticks + frames + distance * weight, next(counter), next_index))
    info['limit_reached'] = depth_limited
    return report('unknown', 'No route was found in the sampled states. This does not prove that the level is impossible.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('level')
    args = parser.parse_args()
    try:
        print(json.dumps(check_playability(json.loads(Path(args.level).read_text())), indent=2))
    except (ValueError, OSError) as exc:
        parser.exit(2, f'Cannot check level: {exc}\n')
