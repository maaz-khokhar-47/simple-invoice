import { useRef, useState, type DragEvent } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined'

const MAX_FILE_BYTES = 2 * 1024 * 1024

interface Props {
  busy?: boolean
  onFile: (file: File) => void
  onInvalid: (message: string) => void
}

/** Same rules as the server, checked here so the user doesn't wait for an upload to fail. */
function checkFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return 'Please choose an Excel .xlsx file (the downloaded template).'
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'That file is larger than 2 MB. Split it into smaller files.'
  }
  return null
}

export function FileDropZone({ busy, onFile, onInvalid }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (file?: File) => {
    if (!file) return
    const problem = checkFile(file)
    if (problem) onInvalid(problem)
    else onFile(file)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!busy) accept(event.dataTransfer.files[0])
  }

  return (
    <Box
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      sx={(theme) => ({
        border: '2px dashed',
        borderColor: dragging ? 'primary.main' : 'divider',
        borderRadius: 2,
        bgcolor: dragging ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
        p: { xs: 3, md: 5 },
        textAlign: 'center',
        transition: 'border-color 150ms ease, background-color 150ms ease',
      })}
    >
      {busy ? (
        <>
          <CircularProgress size={32} sx={{ mb: 1.5 }} />
          <Typography>Checking your file…</Typography>
        </>
      ) : (
        <>
          <UploadFileIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
          <Typography sx={{ fontWeight: 600 }}>Drop your filled-in template here</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            .xlsx, up to 2 MB and 200 invoices
          </Typography>
          <Button variant="contained" onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Upload filled-in template"
        onChange={(event) => {
          accept(event.target.files?.[0])
          // allow picking the same file again after fixing it
          event.target.value = ''
        }}
      />
    </Box>
  )
}
