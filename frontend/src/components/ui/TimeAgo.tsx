import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/utils';

interface TimeAgoProps {
  date: string;
  className?: string;
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  const [text, setText] = useState(() => formatRelativeTime(date));

  useEffect(() => {
    const timer = setInterval(() => {
      setText(formatRelativeTime(date));
    }, 10000);
    return () => clearInterval(timer);
  }, [date]);

  return (
    <time dateTime={date} title={new Date(date).toLocaleString()} className={className}>
      {text}
    </time>
  );
}
