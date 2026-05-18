export class CreateUserDto {
  email!: string;
  username?: string;
  full_name?: string | null;
  password!: string;
}
