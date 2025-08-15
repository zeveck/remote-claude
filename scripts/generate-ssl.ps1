# PowerShell script to generate self-signed SSL certificates for Windows
param(
    [string]$CertPath = "config/ssl",
    [string]$CommonName = "localhost",
    [int]$ValidDays = 365
)

Write-Host "Generating SSL certificates for Remote Claude Web Interface..." -ForegroundColor Green

# Create SSL directory if it doesn't exist
if (!(Test-Path $CertPath)) {
    New-Item -ItemType Directory -Path $CertPath -Force | Out-Null
    Write-Host "Created directory: $CertPath" -ForegroundColor Yellow
}

# Certificate paths
$KeyPath = Join-Path $CertPath "server.key"
$CertFilePath = Join-Path $CertPath "server.crt"
$PfxPath = Join-Path $CertPath "server.pfx"

try {
    # Try using CurrentUser store first (no admin required)
    Write-Host "Attempting to generate certificate in CurrentUser store..." -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate -DnsName $CommonName -CertStoreLocation "cert:\CurrentUser\My" -KeyLength 2048 -KeyAlgorithm RSA -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays($ValidDays)
    
    Write-Host "Certificate generated with thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
    
    # Export certificate to PFX (with empty password for development)
    $certPassword = ConvertTo-SecureString -String "" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $certPassword | Out-Null
    
    # Convert PFX to PEM format for Node.js
    # Using OpenSSL if available, otherwise use .NET methods
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        Write-Host "Using OpenSSL to convert certificates..." -ForegroundColor Yellow
        
        # Extract private key
        & openssl pkcs12 -in $PfxPath -nocerts -out $KeyPath -nodes -passin pass:
        
        # Extract certificate
        & openssl pkcs12 -in $PfxPath -clcerts -nokeys -out $CertFilePath -passin pass:
        
        Write-Host "Certificates converted using OpenSSL" -ForegroundColor Green
    } else {
        Write-Host "OpenSSL not found, using PowerShell certificate export..." -ForegroundColor Yellow
        
        # Export certificate in Base64 format
        $certBase64 = [System.Convert]::ToBase64String($cert.RawData)
        $certPem = "-----BEGIN CERTIFICATE-----`n"
        for ($i = 0; $i -lt $certBase64.Length; $i += 64) {
            $line = $certBase64.Substring($i, [Math]::Min(64, $certBase64.Length - $i))
            $certPem += "$line`n"
        }
        $certPem += "-----END CERTIFICATE-----"
        
        # Save certificate
        $certPem | Out-File -FilePath $CertFilePath -Encoding ASCII
        
        # For the private key, we need to export from the certificate store
        $keyBase64 = [System.Convert]::ToBase64String($cert.PrivateKey.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob))
        $keyPem = "-----BEGIN PRIVATE KEY-----`n"
        for ($i = 0; $i -lt $keyBase64.Length; $i += 64) {
            $line = $keyBase64.Substring($i, [Math]::Min(64, $keyBase64.Length - $i))
            $keyPem += "$line`n"
        }
        $keyPem += "-----END PRIVATE KEY-----"
        
        # Save private key
        $keyPem | Out-File -FilePath $KeyPath -Encoding ASCII
        
        Write-Host "Certificates exported in PEM format" -ForegroundColor Green
    }
    
    # Clean up certificate from store
    Remove-Item -Path "cert:\CurrentUser\My\$($cert.Thumbprint)" -Force
    
    # Remove PFX file as we don't need it anymore
    Remove-Item -Path $PfxPath -Force
    
    Write-Host "`nSSL certificates generated successfully!" -ForegroundColor Green
    Write-Host "Certificate: $CertFilePath" -ForegroundColor Cyan
    Write-Host "Private Key: $KeyPath" -ForegroundColor Cyan
    Write-Host "`nYou can now start the HTTPS server." -ForegroundColor Yellow
    
} catch {
    Write-Error "Failed to generate SSL certificates: $($_.Exception.Message)"
    exit 1
}