/**
 * Tests for MetricGauge component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricGauge } from '@/components/system/MetricGauge';

describe('MetricGauge', () => {
  it('renders 0%', () => {
    render(<MetricGauge label="CPU" value={0} color="accent" />);
    expect(screen.getByText('0%')).toBeDefined();
    expect(screen.getByText('CPU')).toBeDefined();
  });

  it('renders 50%', () => {
    render(<MetricGauge label="RAM" value={50} color="info" />);
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('renders 100%', () => {
    render(<MetricGauge label="Disk" value={100} color="warn" />);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('clamps values above 100', () => {
    render(<MetricGauge label="CPU" value={120} color="accent" />);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<MetricGauge label="RAM" value={50} color="info" subtitle="4 GB / 8 GB" />);
    expect(screen.getByText('4 GB / 8 GB')).toBeDefined();
  });
});
