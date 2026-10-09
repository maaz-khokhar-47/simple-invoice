import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import TableViewIcon from '@mui/icons-material/TableViewOutlined'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import { downloadImportTemplate, importInvoices, previewImport } from '../api/invoices'
import { getErrorMessage } from '../api/client'
import { FileDropZone } from '../components/import/FileDropZone'
import { ImportReview } from '../components/import/ImportReview'
import { useNotify } from '../hooks/useNotify'
import type { ImportPreview, ImportResult } from '../types/invoice'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const STEPS = ['Get the template', 'Upload', 'Review', 'Done']

type Stage =
  | { name: 'upload' }
  | { name: 'review'; fileName: string; preview: ImportPreview }
  | { name: 'done'; result: ImportResult; skippedRows: number[] }

export function ImportInvoicesPage() {
  useDocumentTitle('Import invoices')
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [stage, setStage] = useState<Stage>({ name: 'upload' })
  const [fileError, setFileError] = useState<string | null>(null)
  const [templateDownloaded, setTemplateDownloaded] = useState(false)

  const template = useMutation({
    mutationFn: downloadImportTemplate,
    onSuccess: () => setTemplateDownloaded(true),
    onError: (err) => notify(getErrorMessage(err, 'Could not download the template'), 'error'),
  })

  const check = useMutation({
    mutationFn: (file: File) => previewImport(file),
    onSuccess: (preview, file) => setStage({ name: 'review', fileName: file.name, preview }),
    onError: (err) => setFileError(getErrorMessage(err, 'Could not read that file')),
  })

  const save = useMutation({
    mutationFn: (preview: ImportPreview) =>
      importInvoices(preview.rows.filter((row) => row.valid).map((row) => row.invoice)),
    onSuccess: async (result, preview) => {
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setStage({
        name: 'done',
        result,
        skippedRows: preview.rows.filter((row) => !row.valid).map((row) => row.rowNumber),
      })
    },
  })

  const startOver = () => {
    setStage({ name: 'upload' })
    setFileError(null)
    save.reset()
    check.reset()
  }

  const activeStep = stage.name === 'upload' ? (templateDownloaded ? 1 : 0) : stage.name === 'review' ? 2 : 4

  return (
    <>
      <Button component={RouterLink} to="/invoices" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        Back to invoices
      </Button>

      <Paper sx={{ p: { xs: 2, md: 4 } }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Import invoices from Excel
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Add many invoices at once. You'll see every row checked before anything is saved, and imported invoices
          start as Drafts.
        </Typography>

        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4, display: { xs: 'none', sm: 'flex' } }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {stage.name === 'upload' && (
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TableViewIcon color="primary" sx={{ mt: 0.5 }} />
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography sx={{ fontWeight: 600 }}>1. Download the template</Typography>
                <Typography variant="body2" color="text.secondary">
                  One invoice per row. Required columns are highlighted, and the Instructions sheet explains each
                  one.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                loading={template.isPending}
                onClick={() => template.mutate()}
              >
                Download template
              </Button>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 600, mb: 1.5 }}>2. Upload the filled-in file</Typography>
              {fileError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFileError(null)}>
                  {fileError}
                </Alert>
              )}
              <FileDropZone
                busy={check.isPending}
                onInvalid={setFileError}
                onFile={(file) => {
                  setFileError(null)
                  check.mutate(file)
                }}
              />
            </Box>
          </Stack>
        )}

        {stage.name === 'review' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Checked <strong>{stage.fileName}</strong>. Nothing has been saved yet. Click a row to see the
              invoice it will create.
            </Typography>

            {save.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(save.error, 'The import failed')}. Nothing was imported - upload the file again to
                re-check it.
              </Alert>
            )}

            <ImportReview preview={stage.preview} />

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              spacing={1.5}
              sx={{ justifyContent: 'space-between', mt: 3 }}
            >
              <Button onClick={startOver} disabled={save.isPending}>
                Upload a different file
              </Button>
              <Button
                variant="contained"
                disabled={stage.preview.validCount === 0}
                loading={save.isPending}
                onClick={() => save.mutate(stage.preview)}
              >
                {stage.preview.validCount === 0
                  ? 'Nothing to import'
                  : `Import ${stage.preview.validCount} invoice${stage.preview.validCount === 1 ? '' : 's'} as Draft`}
              </Button>
            </Stack>
          </>
        )}

        {stage.name === 'done' && (
          <Box sx={{ textAlign: 'center', py: { xs: 2, md: 4 } }}>
            <TaskAltIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
            <Typography variant="h6" component="p" gutterBottom>
              Imported {stage.result.created} invoice{stage.result.created === 1 ? '' : 's'} as Draft
            </Typography>
            {stage.skippedRows.length > 0 ? (
              <Typography color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
                {stage.skippedRows.length} row{stage.skippedRows.length === 1 ? ' was' : 's were'} skipped (row{' '}
                {stage.skippedRows.join(', ')}). Fix {stage.skippedRows.length === 1 ? 'it' : 'them'} in the
                spreadsheet, remove the rows that were already imported, and upload again.
              </Typography>
            ) : (
              <Typography color="text.secondary">Review them and mark them as sent when ready.</Typography>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center', mt: 3 }}>
              <Button component={RouterLink} to="/invoices?status=Draft" variant="contained">
                View drafts
              </Button>
              <Button onClick={startOver}>Import another file</Button>
            </Stack>
          </Box>
        )}
      </Paper>
    </>
  )
}
