import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileUp, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { getSupportedFormats, uploadStatement } from "@/lib/api";
import type { BankInfo, UploadResponse } from "@/lib/types";

export default function UploadPage() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [selectedAccountType, setSelectedAccountType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);

  useEffect(() => {
    getSupportedFormats().then((data) => setBanks(data.banks)).catch(console.error);
  }, []);

  const currentBank = banks.find((b) => b.name === selectedBank);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file || !selectedBank || !selectedAccountType) {
      toast.error("Please select a bank, account type, and file.");
      return;
    }

    setUploading(true);
    setResult(null);
    try {
      const res = await uploadStatement(file, selectedBank, selectedAccountType);
      setResult(res);
      toast.success(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Bank Statement</h1>
        <p className="text-muted-foreground">
          Upload your bank statement file to parse and analyze your transactions.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Statement Details</CardTitle>
            <CardDescription>Select your bank and account type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank">Bank</Label>
              <Select value={selectedBank} onValueChange={(v) => { setSelectedBank(v); setSelectedAccountType(""); }}>
                <SelectTrigger id="bank">
                  <SelectValue placeholder="Select bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-type">Account Type</Label>
              <Select
                value={selectedAccountType}
                onValueChange={setSelectedAccountType}
                disabled={!currentBank}
              >
                <SelectTrigger id="account-type">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  {currentBank?.account_types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentBank && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Supported formats:</span>
                {currentBank.file_formats.map((f) => (
                  <Badge key={f} variant="secondary">{f}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Drop zone */}
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Drag and drop or click to select</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <>
                  <FileUp className="mb-3 h-10 w-10 text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
                  </p>
                </>
              ) : (
                <>
                  <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">
                    {isDragActive ? "Drop file here..." : "Drop your statement file here"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse
                  </p>
                </>
              )}
            </div>

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={handleUpload}
              disabled={!file || !selectedBank || !selectedAccountType || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Parse
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Result */}
      {result && (
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            {result.status === "success" ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            )}
            <div className="flex-1">
              <p className="font-semibold">{result.message}</p>
              <p className="text-sm text-muted-foreground">
                {result.bank_name} · {result.account_type} · {result.filename}
              </p>
              {result.error_details && result.error_details.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-yellow-600 dark:text-yellow-400">
                    Show parse errors ({result.error_details.length} unique)
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {result.error_details.map((e, i) => (
                      <li key={i} className="text-xs font-mono text-red-600 dark:text-red-400">
                        {e}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <Button variant="outline" onClick={() => navigate("/transactions")}>
              View Transactions →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
