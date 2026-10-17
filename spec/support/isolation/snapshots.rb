# Lane B-INGEST routes (docs/conventions/multi-tenancy.md). The upload lifecycle routes take an
# id, so they register with a resource + path so the isolation spec proves another agency's upload
# id answers 404; `create` and `current` take no other agency's id (:self).
snapshot_upload = lambda do |agency|
  user = FactoryBot.create(:user, agency: agency)
  SnapshotUpload.create!(agency: agency, user: user, status: "validated")
end

Isolation.register(method: :post, path: "/api/v1/snapshot_uploads", scope: :self)

Isolation.register(method: :get, path: "/api/v1/snapshot_uploads/:id",
                   resource: snapshot_upload,
                   path_for: ->(upload) { "/api/v1/snapshot_uploads/#{upload.id}" })

Isolation.register(method: :post, path: "/api/v1/snapshot_uploads/:id/commit",
                   resource: snapshot_upload,
                   path_for: ->(upload) { "/api/v1/snapshot_uploads/#{upload.id}/commit" })

Isolation.register(method: :delete, path: "/api/v1/snapshot_uploads/:id",
                   resource: snapshot_upload,
                   path_for: ->(upload) { "/api/v1/snapshot_uploads/#{upload.id}" })

Isolation.register(method: :get, path: "/api/v1/snapshots/current", scope: :self)
