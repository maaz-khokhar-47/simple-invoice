import { Box, Grid, Paper, Skeleton, Stack } from '@mui/material'

/** Placeholder with roughly the shape of the detail/edit pages while they load. */
export function PageSkeleton() {
  return (
    <Paper sx={{ p: { xs: 2, md: 4 } }} aria-busy aria-label="Loading">
      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Skeleton width={70} />
          <Skeleton width={180} height={40} />
        </Box>
        <Skeleton variant="rounded" width={140} height={36} />
      </Stack>
      <Grid container spacing={3}>
        {[0, 1].map((col) => (
          <Grid key={col} size={{ xs: 12, md: 6 }}>
            <Skeleton width={120} sx={{ mb: 1 }} />
            <Grid container spacing={2}>
              {[0, 1, 2, 3].map((i) => (
                <Grid key={i} size={6}>
                  <Skeleton width="50%" />
                  <Skeleton width="80%" />
                </Grid>
              ))}
            </Grid>
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={120} sx={{ mt: 4 }} />
    </Paper>
  )
}
