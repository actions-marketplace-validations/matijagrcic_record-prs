import { ESignatureBlock } from '@/components/blocks/e-signature'

export function SignDocumentPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-10" data-testid="signing-page">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Acme Studio / Documents</p>
        <h1 className="text-3xl font-semibold tracking-tight">Sign a document</h1>
        <p className="mt-2 text-muted-foreground">Review the sample agreement, add your signature, and download the signed PDF.</p>
      </div>
      <ESignatureBlock file="/documents/sample-agreement.pdf" />
      <p className="text-sm text-muted-foreground">Demo document. Your signature stays in this browser until you leave the page.</p>
    </main>
  )
}
