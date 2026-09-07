import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { downloadTaskSrt, getTask } from '../api/tasks';
import { listTaskAnnotations } from '../api/tasks';
import { createAnnotation, reviewAnnotation } from '../api/annotations';
import { apiErrorMessage } from '../api/client';
import { downloadBlob } from '../lib/downloadBlob';
import { useAuth } from '../context/AuthContext';
import type { Annotation, Dataset, ReviewDecision, Task } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { WaveformPlayer, type WaveformPlayerHandle } from '../components/WaveformPlayer';
import { TranscriptReference } from '../components/TranscriptReference';
import { RsmlEditor } from '../components/RsmlEditor';

export function TaskReview() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const waveformRef = useRef<WaveformPlayerHandle>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [reviewDraft, setReviewDraft] = useState<Annotation | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<ReviewDecision | null>(null);

  const load = useCallback(async () => {
    if (!id || !user) return;
    const [taskData, annotationList] = await Promise.all([getTask(id), listTaskAnnotations(id)]);
    setTask(taskData.task);
    setDataset(taskData.dataset);
    setAnnotations(annotationList);

    const parent = annotationList
      .filter((a) => a.type === 'annotation' && a.status === 'submitted')
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))[0];

    if (parent) {
      const existingDraft = annotationList.find(
        (a) => a.type === 'review' && a.parentAnnotation === parent._id && a.user === user.id && a.status === 'draft'
      );
      if (existingDraft) {
        setReviewDraft(existingDraft);
      } else {
        try {
          const created = await createAnnotation({ taskId: id, type: 'review', parentAnnotation: parent._id });
          setReviewDraft(created);
        } catch (err) {
          setError(apiErrorMessage(err, 'Could not open a review draft'));
        }
      }
    } else {
      setReviewDraft(null);
    }
  }, [id, user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const parentAnnotation = annotations.find((a) => a._id === reviewDraft?.parentAnnotation) ?? null;

  async function handleDownloadSrt() {
    if (!id) return;
    setError(null);
    try {
      const blob = await downloadTaskSrt(id);
      downloadBlob(blob, `task-${id}.srt`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not download SRT'));
    }
  }

  async function handleDecision(decision: ReviewDecision) {
    if (!reviewDraft) return;
    setDeciding(decision);
    setError(null);
    try {
      await reviewAnnotation(reviewDraft._id, { decision, reviewComment: comment || undefined });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not submit review'));
    } finally {
      setDeciding(null);
    }
  }

  if (loading) return <p className="hint">Loading…</p>;
  if (!task) return <p className="empty">{error ?? 'Task not found'}</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Review</h2>
          <p className="hint">
            <Link to={`/projects/${task.project}`}>&larr; Back to project</Link>
          </p>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <WaveformPlayer ref={waveformRef} audioUrl={task.audioUrl} />

      {dataset?.processing.status === 'completed' && dataset.transcriptSegments.length > 0 && (
        <>
          <TranscriptReference
            segments={dataset.transcriptSegments}
            onSeek={(t) => waveformRef.current?.seekTo(t)}
          />
          <div className="btn-row" style={{ margin: '-10px 0 16px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDownloadSrt}>
              Download SRT
            </button>
          </div>
        </>
      )}

      {!parentAnnotation ? (
        <div className="card">
          <p className="empty">
            Nothing waiting for your review right now (task status: {task.status.replace(/_/g, ' ')}).
          </p>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Annotator's submission</h3>
          <RsmlEditor key={parentAnnotation._id} initialValue={parentAnnotation.rsmlText} editable={false} />

          {reviewDraft?.status === 'draft' ? (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="comment">Review comment (optional)</label>
                <textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={() => handleDecision('accept')}
                  disabled={deciding !== null}
                >
                  {deciding === 'accept' ? 'Accepting…' : 'Accept'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDecision('to_correct')}
                  disabled={deciding !== null}
                >
                  {deciding === 'to_correct' ? 'Sending back…' : 'Send back for correction'}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDecision('reject')}
                  disabled={deciding !== null}
                >
                  {deciding === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </>
          ) : (
            <p className="hint" style={{ marginTop: 12 }}>
              Verdict already submitted: <StatusBadge status={reviewDraft?.status ?? ''} />
            </p>
          )}
        </div>
      )}

      {annotations.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            History
          </div>
          {annotations.map((a) => (
            <div className="transcript-line" key={a._id}>
              <span className="speaker">{a.type}</span>
              <StatusBadge status={a.status} />
              {a.reviewComment && <span className="hint">"{a.reviewComment}"</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
