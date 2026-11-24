import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AutomaticStudio } from '../src/pages/AutomaticStudio';
import { StudioProvider } from '../src/state';
import { sampleLevel } from '../src/services/samples';
const { replay } = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock('../src/services/replay', () => ({ verifyRoute: replay }));
vi.mock('../src/components/GamePlayer', () => ({ GamePlayer: () => <div>Verified game mounted</div> }));
const level = sampleLevel('flat');
const assessment = { status: 'reachable', reason: 'Simulation route', verified_in_game: false, path: [{ direction: 1, jump: false, frames: 10 }], search: {}, physics_version: '1.1' };
const response = (value: unknown) => new Response(JSON.stringify(value));
let report: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  report = { image: { width: 960, height: 540, coordinates: 'exif_oriented_pixels' }, model_status: 'ran',
    status: 'awaiting_phaser', candidates: [], level, original_level: level, assessment, changes: [], attempts: [], issues: [],
    stages: ['detection','recognition','geometry','playability'], warnings: [] };
  replay.mockResolvedValue(true);
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/preview')) return response({ url: 'data:image/png;base64,x', width: 960, height: 540 });
    if (url.endsWith('/generate')) return response(report);
    return response({ id: 'saved', level });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
async function upload() {
  render(<StudioProvider><MemoryRouter><AutomaticStudio /></MemoryRouter></StudioProvider>);
  fireEvent.change(screen.getByLabelText('Upload drawing'), { target: { files: [new File(['image'], 'drawing.png', { type: 'image/png' })] } });
  await screen.findByText('drawing.png · 960 × 540 pixels');
}
it('uses automatic mode without labels or dimensions and saves only after Phaser wins', async () => {
  await upload();
  expect(screen.queryByLabelText('Object type')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('World width')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Generate My Game' }));
  expect(await screen.findByText('Verified game mounted')).toBeInTheDocument();
  expect(replay).toHaveBeenCalledWith(level, assessment.path, expect.any(AbortSignal));
  await userEvent.click(screen.getByRole('button', { name: 'Save level' }));
  expect(await screen.findByText('Game saved in the database.')).toBeInTheDocument();
});
it('does not claim a playable game when Phaser replay fails', async () => {
  replay.mockResolvedValue(false);
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Generate My Game' }));
  expect(await screen.findByText(/Phaser could not finish this route/)).toBeInTheDocument();
  expect(screen.queryByText('Verified game mounted')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save level' })).not.toBeInTheDocument();
});
it('asks only about unclear regions and sends the selected correction', async () => {
  report = { ...report, status: 'needs_correction', level: null, assessment: null,
    candidates: [{ id: 'candidate_0', x: 10, y: 10, width: 20, height: 30, needs_correction: true }],
    issues: [{ id: 'candidate_0', message: 'Unclear letter' }] };
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Generate My Game' }));
  await screen.findByText(/Unclear letter/);
  expect(replay).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByLabelText('Correct candidate_0'), 'spawn');
  await userEvent.click(screen.getByRole('button', { name: 'Generate My Game' }));
  const call = fetchMock.mock.calls.filter(([url]) => url.endsWith('/generate')).at(-1)!;
  expect((call[1] as RequestInit).body).toBeInstanceOf(FormData);
  expect(((call[1] as RequestInit).body as FormData).get('corrections')).toBe('{"candidate_0":"spawn"}');
});
it('keeps a missing-checkpoint result separate from recognition success', async () => {
  report = { ...report, status: 'needs_correction', model_status: 'unavailable', level: null, assessment: null,
    issues: [{ id: null, message: 'Configure DREAMCRAFT_CHECKPOINT on the backend.' }] };
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Generate My Game' }));
  expect(await screen.findByText(/Configure DREAMCRAFT_CHECKPOINT/)).toBeInTheDocument();
  expect(replay).not.toHaveBeenCalled();
  expect(screen.queryByText('Verified game mounted')).not.toBeInTheDocument();
});
it('shows network failures and leaves the drawing available for retry', async () => {
  await upload();
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  await userEvent.click(screen.getByRole('button', { name: 'Generate My Game' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  expect(screen.getByRole('button', { name: 'Generate My Game' })).toBeEnabled();
});
