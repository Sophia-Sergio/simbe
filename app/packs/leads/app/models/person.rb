# One person per normalised email inside an agency (blank-email leads each get their own). A lead is
# one inquiry; the same person can inquire more than once. Identity only (linked-inquiries spec).
class Person < ApplicationRecord
  include AgencyScoped

  has_many :leads
end
