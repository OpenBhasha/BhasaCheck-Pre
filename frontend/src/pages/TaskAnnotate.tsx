import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTask } from '../api/tasks';
import { createAnnotation, submitAnnotation, updateAnnotation } from '../api/annotations';
import { apiErrorMessage } from '../api/client';
import type { Annotation, Dataset, Task } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { WaveformPlayer } from '../components/WaveformPlayer';
import { ProcessingStatusPanel } from '../components/ProcessingStatusPanel';
import { TranscriptReference } from '../components/TranscriptReference';

export function TaskAnnotate() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [rsmlText, setRsmlText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTask = useCallback(async () => {
    if (!id) return null;
    const data = await getTask(id);
    setTask(data.task);
    setDataset(data.dataset);
    return data;
  }, [id]);

  const tryOpenDraft = useCallback(async () => {
    if (!id) return;
    try {
      const draft = await createAnnotation({ taskId: id, type: 'annotation' });
      setAnnotation(draft);
      setRsmlText(draft.rsmlText);
    } catch (err) {
      // 409 = preprocessing not done yet, surfaced via the processing panel instead
      setError(apiErrorMessage(err, 'Could not open annotation draft'));
    }
  }, [id]);

  useEffect(() => {
    loadTask()
      .then((data) => {
        if (data && data.dataset?.processing.status === 'completed') {
          return tryOpenDraft();
        }
        return undefined;
      })
      .finally(() => setLoading(false));
  }, [loadTask, tryOpenDraft]);

  useEffect(() => {
    if (!dataset || dataset.processing.status === 'completed' || dataset.processing.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const data = await loadTask();
      if (data?.dataset?.processing.status === 'completed') {
        if (pollRef.current) clearInterval(pollRef.current);
        await tryOpenDraft();
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.processing.status]);

  async function handleSave() {
    if (!annotation) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAnnotation(annotation._id, rsmlText);
      setAnnotation(updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!annotation) return;
    setSubmitting(true);
    setError(null);
    try {
      await handleSave();
      const submitted = await submitAnnotation(annotation._id);
      setAnnotation(submitted);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not submit'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="hint">Loading…</p>;
  if (!task) return <p className="empty">{error ?? 'Task not found'}</p>;

  const isDraftEditable = annotation?.status === 'draft';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Annotate</h2>
          <p className="hint">
            <Link to={`/projects/${task.project}`}>&larr; Back to project</Link>
          </p>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <WaveformPlayer audioUrl={task.audioUrl} />

      {dataset && dataset.processing.status !== 'completed' && (
        <ProcessingStatusPanel dataset={dataset} />
      )}

      {dataset?.processing.status === 'completed' && dataset.transcriptSegments.length > 0 && (
        <TranscriptReference segments={dataset.transcriptSegments} />
      )}

      {annotation && (
        <div className="card">
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>RSML text</h3>
            <StatusBadge status={annotation.status} />
          </div>
          <textarea
            style={{ minHeight: 220 }}
            value={rsmlText}
            onChange={(e) => setRsmlText(e.target.value)}
            disabled={!isDraftEditable}
          />
          {isDraftEditable ? (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 12 }}>
              {annotation.status === 'submitted'
                ? 'Submitted — locked until a reviewer sends it back for correction.'
                : `This annotation is ${annotation.status}.`}
            </p>
          )}

          {annotation.editHistory.length > 0 && (
            <>
              <div className="section-title">Edit history</div>
              {annotation.editHistory
                .slice()
                .reverse()
                .map((entry, i) => (
                  <div key={i} className="transcript-line">
                    <span className="ts">{new Date(entry.editedAt).toLocaleString()}</span>
                    <span>{entry.previousText || <em>(empty)</em>}</span>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
