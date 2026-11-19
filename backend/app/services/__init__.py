class DomainError(Exception):
    """Kesalahan aturan bisnis yang ditampilkan ke pengguna (HTTP 400)."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
