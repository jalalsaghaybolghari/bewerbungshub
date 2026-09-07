import { decideOutcome } from './decision';

describe('decideOutcome', () => {
  it('returns no_action for a classification of none, regardless of auto-approve (happy path)', () => {
    expect(decideOutcome('applied', 'none', true)).toEqual({
      action: 'no_action',
    });
    expect(decideOutcome('applied', 'none', false)).toEqual({
      action: 'no_action',
    });
  });

  it('auto-applies a rejection from a non-terminal status when auto-approve is on (happy path)', () => {
    expect(decideOutcome('applied', 'rejection', true)).toEqual({
      action: 'auto',
      proposedStatus: 'rejected',
    });
  });

  it('queues a rejection for manual approval when auto-approve is off (happy path)', () => {
    expect(decideOutcome('applied', 'rejection', false)).toEqual({
      action: 'manual',
      proposedStatus: 'rejected',
    });
  });

  it.each(['accepted', 'rejected', 'withdrawn', 'ghosted'] as const)(
    'never auto-applies onto an already-terminal status (%s) even with auto-approve on (negative case)',
    (terminalStatus) => {
      expect(decideOutcome(terminalStatus, 'rejection', true)).toEqual({
        action: 'manual',
        proposedStatus: 'rejected',
      });
      expect(decideOutcome(terminalStatus, 'interview', true)).toEqual({
        action: 'manual',
        proposedStatus: 'interview',
      });
    },
  );

  it('auto-applies an interview outcome when it is forward pipeline progress (happy path)', () => {
    expect(decideOutcome('applied', 'interview', true)).toEqual({
      action: 'auto',
      proposedStatus: 'interview',
    });
    expect(decideOutcome('screening', 'interview', true)).toEqual({
      action: 'auto',
      proposedStatus: 'interview',
    });
  });

  it('never auto-downgrades a status already at or past interview (negative case)', () => {
    expect(decideOutcome('interview', 'interview', true)).toEqual({
      action: 'manual',
      proposedStatus: 'interview',
    });
    expect(decideOutcome('offer', 'interview', true)).toEqual({
      action: 'manual',
      proposedStatus: 'interview',
    });
  });

  it('a rejection is always eligible for auto-apply from any non-terminal status, unlike interview (edge case)', () => {
    // 'offer' is past 'interview' in the pipeline — an interview outcome
    // there is manual (checked above), but a rejection is still a valid
    // exit from any non-terminal state.
    expect(decideOutcome('offer', 'rejection', true)).toEqual({
      action: 'auto',
      proposedStatus: 'rejected',
    });
  });

  it('respects the auto-approve setting even for an otherwise-eligible outcome (edge case)', () => {
    expect(decideOutcome('applied', 'interview', false)).toEqual({
      action: 'manual',
      proposedStatus: 'interview',
    });
  });
});
