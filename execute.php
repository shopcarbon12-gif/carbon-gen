<?php
$app = \App\Models\Application::where('uuid', 'aw4800s4wsgok0wck480goco')->first();
$deployment_uuid = new \Visus\Cuid2\Cuid2;
$result = queue_application_deployment(application: $app, deployment_uuid: $deployment_uuid, force_rebuild: true, pull_request_id: 0, is_api: true);
echo json_encode($result) . PHP_EOL;

