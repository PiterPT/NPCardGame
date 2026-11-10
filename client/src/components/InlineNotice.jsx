import React from 'react';

export default function InlineNotice({ notice }) {
  if (!notice || !notice.text) return null;
  const isErr = notice.type === 'error';
  return (
    <div className={`inline-notice ${isErr ? 'inline-notice--error' : 'inline-notice--success'}`}>
      {notice.text}
    </div>
  );
}
