/**
 * Placeholder destinations for links the case list points at. The manual case
 * form, the query-form upload and the case screen are built in later prompts.
 */

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-lg font-semibold text-resend-purple">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{note}</p>
      <a
        href="/"
        className="mt-6 inline-block text-sm font-medium text-resend-purple underline"
      >
        Back to the case list
      </a>
    </div>
  );
}

export function NewCaseStub() {
  const upload = new URLSearchParams(window.location.search).get('upload');
  return (
    <Placeholder
      title={upload ? 'Upload a query form' : 'Add a case'}
      note="The case form is built in a later prompt."
    />
  );
}

export function CaseScreenStub() {
  return (
    <Placeholder
      title="Case screen"
      note="The case screen is built in a later prompt."
    />
  );
}
