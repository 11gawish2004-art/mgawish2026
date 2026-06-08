
-- Restrict listing on public 'images' bucket and require ownership for update/delete
DROP POLICY IF EXISTS "Public can view images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete images" ON storage.objects;

-- Owners (and service role) can update their own objects
CREATE POLICY "Owners can update their images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'images' AND owner = auth.uid())
WITH CHECK (bucket_id = 'images' AND owner = auth.uid());

-- Owners can delete their own objects
CREATE POLICY "Owners can delete their images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'images' AND owner = auth.uid());
