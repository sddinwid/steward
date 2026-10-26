/** Multiple reviewed destinations may implement different operations of one
 * capability. A new audience never changes an existing obligation's binding. */
export const peerPurposeMigration=`
DROP INDEX smart_one_binding;
CREATE UNIQUE INDEX smart_one_binding ON smart_bindings(consumer_id,capability_id,
 COALESCE(source_program_id,'00000000-0000-0000-0000-000000000000'::uuid),
 COALESCE(destination_program_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(purpose,''))
 WHERE state='approved';
`;
