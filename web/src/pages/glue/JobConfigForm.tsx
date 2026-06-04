import { Plus, Trash2 } from "lucide-react";
import type { JobConfig, JobType } from "./glueApi";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function JobConfigForm({
  type,
  config,
  onChange,
}: {
  type: JobType;
  config: JobConfig;
  onChange: (next: JobConfig) => void;
}) {
  const set = <K extends keyof JobConfig>(key: K, value: JobConfig[K]) =>
    onChange({ ...config, [key]: value });
  const isSpark = type === "glueetl";

  const setParam = (i: number, patch: Partial<{ key: string; value: string }>) => {
    const parameters = config.parameters.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange({ ...config, parameters });
  };
  const addParam = () => onChange({ ...config, parameters: [...config.parameters, { key: "", value: "" }] });
  const removeParam = (i: number) =>
    onChange({ ...config, parameters: config.parameters.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      {/* Properties */}
      <section className="card p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Properties</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Type">
            <input className="input" value={isSpark ? "Spark (PySpark)" : "Python shell"} disabled />
          </Field>
          <Field label="Glue version">
            <select className="input" value={config.glueVersion} onChange={(e) => set("glueVersion", e.target.value)}>
              {["4.0", "3.0", "2.0", "1.0"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <input className="input" value="Python" disabled />
          </Field>
          {isSpark && (
            <Field label="Worker type" hint="Cosmetic — informs core count locally">
              <select className="input" value={config.workerType} onChange={(e) => set("workerType", e.target.value)}>
                {["G.1X", "G.2X", "G.4X", "G.8X"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          )}
          {isSpark && (
            <Field label="Requested workers" hint={`Maps to local[${Math.max(1, config.numberOfWorkers || 1)}] Spark cores`}>
              <input
                type="number"
                min={1}
                className="input"
                value={config.numberOfWorkers}
                onChange={(e) => set("numberOfWorkers", Number(e.target.value))}
              />
            </Field>
          )}
          <Field label="Job timeout (minutes)">
            <input
              type="number"
              min={1}
              className="input"
              value={config.timeoutMinutes}
              onChange={(e) => set("timeoutMinutes", Number(e.target.value))}
            />
          </Field>
          <Field label="Max concurrent runs">
            <input
              type="number"
              min={1}
              className="input"
              value={config.maxConcurrentRuns}
              onChange={(e) => set("maxConcurrentRuns", Number(e.target.value))}
            />
          </Field>
          <Field label="Job bookmark">
            <select className="input" value={config.jobBookmark} onChange={(e) => set("jobBookmark", e.target.value)}>
              <option value="job-bookmark-disable">Disable</option>
              <option value="job-bookmark-enable">Enable</option>
              <option value="job-bookmark-pause">Pause</option>
            </select>
          </Field>
          <Field label="Temporary directory (--TempDir)">
            <input className="input" value={config.tempDir} onChange={(e) => set("tempDir", e.target.value)} placeholder="s3://bucket/temp/" />
          </Field>
        </div>
      </section>

      {/* Libraries */}
      <section className="card p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-500">Libraries</h3>
        <p className="mb-4 text-xs text-ink-500">
          Comma-separated <code>s3://</code> or <code>https://</code> paths. <code>s3://</code> is fetched from
          Floci’s S3 at run time, then passed to the runtime.
        </p>
        <div className="space-y-4">
          <Field label="Python library path" hint="--extra-py-files (.py / .zip / .egg / .whl)">
            <input className="input font-mono text-xs" value={config.extraPyFiles} onChange={(e) => set("extraPyFiles", e.target.value)} placeholder="s3://my-bucket/libs/utils.py, s3://my-bucket/libs/pkg.zip" />
          </Field>
          {isSpark && (
            <Field label="Dependent JARs path" hint="--extra-jars (passed to spark-submit --jars)">
              <input className="input font-mono text-xs" value={config.extraJars} onChange={(e) => set("extraJars", e.target.value)} placeholder="s3://my-bucket/jars/connector.jar" />
            </Field>
          )}
          <Field label="Referenced files path" hint="--extra-files (made available alongside the script)">
            <input className="input font-mono text-xs" value={config.extraFiles} onChange={(e) => set("extraFiles", e.target.value)} placeholder="s3://my-bucket/config/app.conf" />
          </Field>
          <Field label="Additional Python modules" hint="--additional-python-modules (pip installed before the run)">
            <input className="input font-mono text-xs" value={config.additionalPythonModules} onChange={(e) => set("additionalPythonModules", e.target.value)} placeholder="requests==2.32.3, boto3" />
          </Field>
        </div>
      </section>

      {/* Job parameters */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Job parameters</h3>
            <p className="text-xs text-ink-500">Passed as <code>--key value</code> (read via getResolvedOptions / sys.argv). <code>--JOB_NAME</code> is added automatically.</p>
          </div>
          <button className="btn-default" onClick={addParam}>
            <Plus className="h-4 w-4" /> Add parameter
          </button>
        </div>
        {config.parameters.length === 0 ? (
          <p className="py-3 text-sm text-ink-500">No job parameters.</p>
        ) : (
          <div className="space-y-2">
            {config.parameters.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input font-mono text-xs" placeholder="--key" value={p.key} onChange={(e) => setParam(i, { key: e.target.value })} />
                <input className="input font-mono text-xs" placeholder="value" value={p.value} onChange={(e) => setParam(i, { value: e.target.value })} />
                <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => removeParam(i)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
