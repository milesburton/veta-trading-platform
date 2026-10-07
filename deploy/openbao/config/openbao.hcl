ui            = true
disable_mlock = true
api_addr      = "http://127.0.0.1:8200"
cluster_addr  = "http://127.0.0.1:8201"

storage "raft" {
  path    = "/openbao/file"
  node_id = "veta-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

seal "static" {
  current_key_id = "veta-1"
  current_key    = "file:///openbao/unseal/current.key"
}

audit "file" "file" {
  options {
    file_path = "/openbao/logs/audit.log"
  }
}
