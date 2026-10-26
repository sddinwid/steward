CREATE INDEX participant_service_destinations ON business_records((data->>'programId'),(data->>'status')) WHERE kind='service-destination';
