import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadRsmlAnnotator, type RSMLAnnotatorInstance } from '../lib/loadRsml';

export interface RsmlEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
}

interface RsmlEditorProps {
  /** Initial RSML text. Only read once, at mount — call setValue() via the
   * ref to load different content later (e.g. once an async fetch resolves). */
  initialValue?: string;
  /** When false, only the rendered chip preview is shown — the raw editing
   * surface is present (the widget requires it) but visually hidden and
   * unfocusable, so there's no way to actually type into it. */
  editable?: boolean;
  height?: number;
}

/**
 * Thin React wrapper around the `rsml` npm package's RSMLAnnotator: a
 * plain textarea (tag autocomplete on @/#/!/&, syntax highlighting once
 * CodeMirror loads) paired with a live-rendered preview pane showing tags,
 * entities, languages, and speaker turns as chips. The library itself loads
 * from a CDN script (see lib/loadRsml.ts for why), so mounting is async.
 */
export const RsmlEditor = forwardRef<RsmlEditorHandle, RsmlEditorProps>(function RsmlEditor(
  { initialValue = '', editable = true, height = 260 },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const annotatorRef = useRef<RSMLAnnotatorInstance | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    loadRsmlAnnotator()
      .then((RSMLAnnotator) => {
        if (cancelled || !textareaRef.current || !outputRef.current || annotatorRef.current) return;
        annotatorRef.current = new RSMLAnnotator({
          textarea: textareaRef.current,
          output: outputRef.current,
        });
        annotatorRef.current.setValue(initialValue);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('[RsmlEditor] failed to load RSMLAnnotator:', err);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      annotatorRef.current?.destroy();
      annotatorRef.current = null;
    };
    // initialValue is intentionally only applied on mount — see the
    // RsmlEditorProps.initialValue doc comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    // Falls back to the raw textarea's own value (not just initialValue) so
    // typing still works — and gets saved — if the CDN script never loaded.
    getValue: () => annotatorRef.current?.getValue() ?? textareaRef.current?.value ?? initialValue,
    setValue: (value: string) => {
      if (annotatorRef.current) {
        annotatorRef.current.setValue(value);
      } else if (textareaRef.current) {
        textareaRef.current.value = value;
      }
    },
  }));

  return (
    <div className={editable ? 'rsml-editor grid-2' : 'rsml-editor rsml-editor-preview-only'}>
      <div className={editable ? undefined : 'rsml-editor-hidden-source'}>
        <textarea
          ref={textareaRef}
          rows={12}
          tabIndex={editable ? 0 : -1}
          readOnly={!editable}
          defaultValue={initialValue}
          placeholder="Type @ for tags, # for entities, ! for languages, & for speakers..."
          style={{ minHeight: height, resize: editable ? 'vertical' : 'none' }}
        />
      </div>
      <div style={{ minHeight: height }}>
        {/* Once mounted, RSMLAnnotator owns this div's innerHTML directly —
            it must never also be a React children target, or the two would
            fight over the same DOM node on the next re-render. The
            loading/error message is a sibling, not a child, of outputRef. */}
        {status === 'loading' && <p className="hint">Loading annotation editor…</p>}
        {status === 'error' && (
          <p className="hint">
            Couldn't load the RSML editor (needs internet access to load it). Edit the plain text on
            the left instead.
          </p>
        )}
        <div
          ref={outputRef}
          className="rsml-output"
          style={{ minHeight: height, display: status === 'ready' ? undefined : 'none' }}
        />
      </div>
    </div>
  );
});
