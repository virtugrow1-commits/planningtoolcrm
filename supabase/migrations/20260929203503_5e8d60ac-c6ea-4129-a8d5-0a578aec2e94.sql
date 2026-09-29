UPDATE public.tasks
SET description = NULLIF(
  btrim(
    regexp_replace(
      regexp_replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    regexp_replace(
                      regexp_replace(description, '<\s*br\s*/?\s*>', E'\n', 'gi'),
                      '<\s*/\s*(p|div|li|h[1-6])\s*>', E'\n', 'gi'
                    ),
                    '&nbsp;', ' '
                  ),
                  '&amp;', '&'
                ),
                '&quot;', '"'
              ),
              '&#39;', ''''
            ),
            '&lt;', '<'
          ),
          '&gt;', '>'
        ),
        '<[^>]*>', '', 'g'
      ),
      E'\n{3,}', E'\n\n', 'g'
    )
  ),
  ''
)
WHERE description IS NOT NULL
  AND description ~ '<[^>]+>';